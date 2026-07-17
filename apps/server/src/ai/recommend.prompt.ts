/**
 * 搭配推荐的共用 prompt 与解析兜底（PRD 4.5）。
 *
 * 与识别同构：两个 Provider 共用一份「私人造型师」system prompt 与 Zod 解析兜底，
 * 各自只把它塞进自家协议的调用格式。推荐是纯文本对话（不涉图），
 * 输入的衣橱摘要 / 天气 / 场合由后端组装成一段用户消息发给模型。
 */

import {
  RecommendOutputSchema,
  type RecommendInput,
  type RecommendOutput,
} from '@zhiyi/shared';

/**
 * 推荐用的 system prompt。
 *
 * 关键约束（与后端 pruneRecommend 双重把关）：
 * - itemIds 只能取自用户给出的衣橱清单，严禁编造 id（编造的会被后端二次剔除）
 * - 只返回 JSON，字段严格对齐 RecommendOutputSchema
 */
export const RECOMMEND_SYSTEM_PROMPT = `你是一位专业的私人穿搭造型师。根据用户提供的衣橱清单、当前天气与场合，从衣橱中挑选真实存在的单品，搭配出 1~3 套完整、协调、适合当下的穿着方案。

严格要求：
1. 直接输出一个 JSON 对象，不要任何思考过程、解释文字或 markdown 代码块，第一个字符必须是 {。
2. itemIds 必须是「字符串数组」，每个元素就是清单里的 id 原文（如 ["a","b"]）；绝不可写成对象数组、不可加 type/name 等额外字段、不可编造清单里没有的 id。
3. 每套至少包含一件主体服装；有外套/鞋子/配饰时应合理组合，避免季节或场合冲突（如寒冬不推短袖、正式场合不配拖鞋）。
4. matchScore 为该套与当前天气+场合的契合度，0~100 的整数。
5. reason 用一句自然、具体、可感的中文说明推荐理由（结合天气或场合），不要空泛套话。

严格按以下结构返回，字段名与类型不得改动：
{
  "outfits": [
    {
      "itemIds": ["清单里的id原文", "另一个id原文"],
      "occasion": "适用场合，如 通勤",
      "styleTag": "风格标签，如 极简",
      "matchScore": 88,
      "reason": "今天 12℃ 微凉，这件针织衫叠加风衣既保暖又利落，适合通勤。"
    }
  ]
}`;

/**
 * 把推荐输入组装成发给模型的用户消息文本。
 *
 * 天气可能缺失（未配置/取值失败），此时明确告知模型「按季节常识推荐」，
 * 让降级路径也能出合理结果，而非让模型面对空天气瞎猜。
 *
 * @param input 推荐输入契约
 * @returns 拼接好的用户消息
 */
export function buildRecommendUserPrompt(input: RecommendInput): string {
  const { weather, occasion, wardrobe } = input;

  const weatherLine = weather
    ? `当前天气：${weather.desc}，气温 ${weather.temp}℃，体感 ${weather.feels}℃，降水概率 ${Math.round(
        weather.rain * 100,
      )}%${weather.uv ? `，紫外线 ${weather.uv}` : ''}。`
    : '当前天气未知，请按当下季节的一般穿着常识推荐。';

  const occasionLine = occasion ? `场合：${occasion}。` : '场合：日常。';

  // 衣橱清单逐行列出，id 在最前，方便模型准确回填 itemIds
  const wardrobeLines = wardrobe
    .map(
      (g) =>
        `- id=${g.id} | ${g.category} | ${g.color} | 季节:${g.seasons.join('/')} | ${g.formality}`,
    )
    .join('\n');

  return `${weatherLine}
${occasionLine}

我的衣橱清单（只能从这些 id 中选）：
${wardrobeLines}

请据此搭配，按要求只返回 JSON。`;
}

/**
 * 从模型返回的原始文本中提取 JSON 并过 Zod 校验（与识别同套兜底）。
 *
 * @param raw 模型返回的文本
 * @returns 校验通过的推荐结果（itemIds 真实性仍需上层 pruneRecommend 把关）
 * @throws JSON 解析失败或 Zod 校验不通过时抛错，供上层重试
 */
export function parseRecommend(raw: string): RecommendOutput {
  const jsonText = stripCodeFence(raw).trim();
  const parsed = JSON.parse(jsonText) as unknown;
  return RecommendOutputSchema.parse(parsed);
}

/** 剥离模型可能多加的 ```json ... ``` 代码块围栏 */
function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fenced ? fenced[1] : text;
}
