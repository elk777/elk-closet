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
 * 识别用的 system prompt（按用户品类候选集动态拼装）。
 *
 * 品类已用户化：候选集来自调用方传入的用户分类表（自定义分类要能被识别命中，
 * 必须进 prompt），缺省回退内置模板。其余枚举仍是静态白名单，
 * 与 Zod 双重约束（PRD 5.5.1）：一层约束模型少犯错，一层在后端兜底拦截。
 * @param categories 品类候选集；缺省用内置模板 CATEGORIES
 * @returns 拼装好的 system prompt
 */
export function buildRecognitionSystemPrompt(
  categories: readonly string[] = CATEGORIES,
): string {
  return `你是服饰识别助手，识别对象包括服装（上衣、裤子、鞋子等）与配饰（包包、帽子、首饰等）。分析用户提供的单件物品图片，输出结构化属性。

严格要求：
1. 只返回一个 JSON 对象，不要任何解释文字、不要 markdown 代码块。
2. 先判断大类 majorType（服装 还是 配饰），再从该大类下选择具体品类——包包/帽子/首饰等配饰不要归入任何服装品类。
3. 枚举字段的值必须从下方白名单中选取，不得自创：
   - category（品类）：${categories.join(' / ')}
   - majorType（大类）：${MAJOR_TYPES.join(' / ')}
   - thickness（厚薄）：${THICKNESS.join(' / ')}
   - formality（正式度）：${FORMALITY.join(' / ')}
   - seasons（适用季节，数组，至少一项）：${SEASONS.join(' / ')}
4. 无法确定品类时，category 填「其他」。
5. 如果你无法查看或加载图片，禁止凭空猜测：category 填「其他」，confidence 填 0。
6. 如果图片里根本没有服装或配饰（例如食物、菜谱、风景、聊天记录、纯文字截图、宠物），
   isGarment 填 false，其余字段按格式填占位值即可，不要为它们编造有意义的内容。
   只要画面里存在可录入的服装或配饰（含包包/帽子/首饰等），isGarment 就填 true；
   拿不准时填 true。
7. colorHex 用 #RRGGBB 六位十六进制近似主色。
8. confidence 为你对本次识别的自评置信度，0~1 的小数。

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
  "isGarment": true,
  "extra": {}
}`;
}

/** 用户侧提示语（图片随此消息一起传，具体格式由各 Provider 适配） */
export const RECOGNITION_USER_PROMPT = '请识别这件服饰的属性，按要求只返回 JSON。';

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
