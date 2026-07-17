/**
 * 穿搭打卡「预猜用了哪几件」的共用 prompt 与解析兜底（PRD 4.7 系统预猜）。
 *
 * 与识别/推荐同构：两个 Provider 共用一份 system prompt 与 Zod 解析兜底，
 * 各自把它塞进自家协议的多图调用格式。
 *
 * 关键约束：模型对着打卡照 + 衣橱候选单品图做视觉比对，只回命中的 id，
 * id 只能取自候选清单（编造的由上层 pruneGuess 二次剔除）。
 */

import {
  GuessOutfitResultSchema,
  type GuessOutfitResult,
} from '@zhiyi/shared';

/**
 * 预猜用的 system prompt。
 *
 * 强调「宁缺毋滥」：不确定的不猜，避免给用户一堆错选反增摩擦——
 * 漏了用户手动加一下即可，错了却要用户逐个取消，后者体验更差。
 */
export const GUESS_OUTFIT_SYSTEM_PROMPT = `你是穿搭识别助手。用户给你一张「今日穿搭照」和一份「衣橱候选清单」（每件含编号 id、缩略图与简述）。

你的任务：判断这张穿搭照里，人物身上实际穿着/佩戴的是候选清单里的哪几件，返回它们的 id。

严格要求：
1. 只返回一个 JSON 对象，不要任何解释文字、不要 markdown 代码块、不要输出思考过程。
2. itemIds 只能是候选清单里给出的 id，绝不可编造。
3. 宁缺毋滥：只返回你有把握确实穿在身上的单品；不确定的不要放进来。
4. 照片里没有出现在候选清单中的衣物，忽略。

返回格式：
{ "itemIds": ["候选清单里的真实 id", "..."] }`;

/** 用户侧提示语（打卡照与候选图随消息一起传，具体格式由各 Provider 适配） */
export const GUESS_OUTFIT_USER_PROMPT =
  '第一张是今日穿搭照，其余每张是衣橱候选单品（图前会标注其 id 与简述）。请判断穿搭照里用了哪几件，按要求只返回 JSON。';

/**
 * 从模型返回的原始文本中提取 JSON 并过 Zod 校验（与识别/推荐同套兜底）。
 * @param raw 模型返回的文本
 * @returns 校验通过的预猜结果（id 真实性仍需上层 pruneGuess 把关）
 * @throws JSON 解析失败或 Zod 校验不通过时抛错，供上层重试
 */
export function parseGuessOutfit(raw: string): GuessOutfitResult {
  const jsonText = stripCodeFence(raw).trim();
  const parsed = JSON.parse(jsonText) as unknown;
  return GuessOutfitResultSchema.parse(parsed);
}

/** 剥离模型可能多加的 ```json ... ``` 代码块围栏 */
function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fenced ? fenced[1] : text;
}
