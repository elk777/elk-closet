/**
 * 衣物识别的共用 prompt 与解析兜底（PRD 5.5.2 / 5.5.4）。
 *
 * 为什么两个 Provider 共用一份：识别的「契约」与模型无关——
 * 同一套 system prompt（嵌入枚举白名单 + 只返回 JSON）、同一套 Zod 解析兜底，
 * Anthropic / OpenAI 实现只是把它塞进各自协议的调用格式，逻辑不重复。
 */

import {
  CATEGORIES,
  FORMALITY,
  MAJOR_TYPES,
  RecognitionResultSchema,
  SEASONS,
  THICKNESS,
  type RecognitionResult,
} from '@zhiyi/shared';

/**
 * 识别用的 system prompt。
 *
 * 把枚举白名单直接写进 prompt（与 Zod 双重约束，PRD 5.5.1）：
 * 一层约束模型少犯错，一层在后端兜底拦截，脏数据绝不进库。
 */
export const RECOGNITION_SYSTEM_PROMPT = `你是服装衣物识别助手。分析用户提供的单件衣物图片，输出结构化属性。

严格要求：
1. 只返回一个 JSON 对象，不要任何解释文字、不要 markdown 代码块。
2. 枚举字段的值必须从下方白名单中选取，不得自创：
   - category（品类）：${CATEGORIES.join(' / ')}
   - majorType（大类）：${MAJOR_TYPES.join(' / ')}
   - thickness（厚薄）：${THICKNESS.join(' / ')}
   - formality（正式度）：${FORMALITY.join(' / ')}
   - seasons（适用季节，数组，至少一项）：${SEASONS.join(' / ')}
3. 无法确定品类时，category 填「其他」。
4. colorHex 用 #RRGGBB 六位十六进制近似主色。
5. confidence 为你对本次识别的自评置信度，0~1 的小数。

返回字段：
{
  "category": "品类",
  "majorType": "服装 或 配饰",
  "mainColor": "主色中文名，如 米白",
  "colorHex": "#E8E2D4",
  "material": "材质，如 羊毛混纺，不确定填空字符串",
  "thickness": "薄/中/厚",
  "seasons": ["秋", "冬"],
  "formality": "休闲/日常/正式",
  "styleTags": ["极简", "通勤"],
  "confidence": 0.92,
  "extra": {}
}`;

/** 用户侧提示语（图片随此消息一起传，具体格式由各 Provider 适配） */
export const RECOGNITION_USER_PROMPT = '请识别这件衣物的属性，按要求只返回 JSON。';

/**
 * 从模型返回的原始文本中提取 JSON 并过 Zod 校验（PRD 5.5.4 兜底）。
 *
 * 处理两类现实脏输出：
 * - 模型偶尔包裹 markdown 代码块 → 剥离 ```json ``` 再解析
 * - 枚举越界 / 字段缺失 → 交给 Zod 拦截，调用方据此决定重试或降级
 *
 * @param raw 模型返回的文本
 * @returns 校验通过的识别结果
 * @throws JSON 解析失败或 Zod 校验不通过时抛错，供上层重试
 */
export function parseRecognition(raw: string): RecognitionResult {
  const jsonText = stripCodeFence(raw).trim();
  const parsed = JSON.parse(jsonText) as unknown;
  return RecognitionResultSchema.parse(parsed);
}

/** 剥离模型可能多加的 ```json ... ``` 代码块围栏 */
function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fenced ? fenced[1] : text;
}
