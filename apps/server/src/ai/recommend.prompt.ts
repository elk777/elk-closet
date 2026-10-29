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
 * 每次推荐的默认产出套数。
 *
 * 定 2 套而非 3：生成套数直接决定 completion 成本，而首页纵向列表 2 套已够首屏。
 * 模型自决（「1~2 套」）会让单次成本不可预估，且缓存一个时段后无法回调，
 * 故用固定值。要调整只改这里。
 */
export const RECOMMEND_OUTFIT_COUNT = 2;

/**
 * 推荐用的 system prompt。
 *
 * 关键约束（与后端 pruneRecommend 双重把关）：
 * - itemIds 只能取自用户给出的衣橱清单，严禁编造 id（编造的会被后端二次剔除）
 * - 只返回 JSON，字段严格对齐 RecommendOutputSchema
 *
 * 为什么文案这么精简（2026-10-29）：推荐 prompt 曾达 1616 tokens（26 件衣橱），
 * 上游按 tpm 限流，体积直接换算成 429 概率。删掉的是「每个字段都举例」这类冗余
 * 说明与重复的格式禁忌，保留的是防回归的五条底线（见下）。
 * 底线不可再删：只返回 JSON / itemIds 只能取清单编号 / 每套至少一件主体服装 /
 * matchScore 0~100 / reason 具体可感。删掉任何一条都会让模型开始跑偏。
 */
export const RECOMMEND_SYSTEM_PROMPT = `你是私人穿搭造型师。根据衣橱清单与天气、场合、风格、季节约束，从清单中挑选真实存在的单品，搭配出 ${RECOMMEND_OUTFIT_COUNT} 套协调、贴合约束的方案。

严格要求：
1. 只输出一个 JSON 对象，第一个字符必须是 {，不要思考过程、解释或 markdown 代码块。
2. itemIds 是字符串数组，每个元素只能填清单每行**第一个字段的编号原文**（如 "3"），不得编造清单外的编号。
3. 每套至少一件主体服装；有外套/鞋子/配饰时应合理组合，避免季节或场合冲突（寒冬不推短袖、正式场合不配拖鞋）。
4. 指定风格时每套整体贴合该风格；指定场合时正式度要匹配。
5. matchScore 为与给定约束的契合度，0~100 整数。
6. reason 用一句具体可感的中文说明推荐理由，不要空泛套话。

返回结构（字段名与类型不得改动）：
{
  "outfits": [
    {
      "itemIds": ["编号1", "编号2"],
      "occasion": "通勤",
      "styleTag": "极简",
      "matchScore": 88,
      "reason": "今天 12℃ 微凉，针织衫叠风衣既保暖又利落。"
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
  const { weather, occasion, style, season, wardrobe } = input;

  const weatherLine = weather
    ? `当前天气：${weather.desc}，气温 ${weather.temp}℃，体感 ${weather.feels}℃，降水概率 ${Math.round(
        weather.rain * 100,
      )}%${weather.uv ? `，紫外线 ${weather.uv}` : ''}。`
    : '当前天气未知，请按当下季节的一般穿着常识推荐。';

  const occasionLine = occasion ? `场合：${occasion}。` : '场合：日常。';

  // 智能搭配维度：仅在指定时追加，避免给今日推荐塞无关约束
  const seasonLine = season ? `季节：${season}，清单已只含当季衣物。` : '';
  const styleLine = style ? `目标风格：${style}，请让每套整体贴合该风格。` : '';

  // 衣橱清单逐行列出，编号在最前，方便模型准确回填 itemIds。
  //
  // 为什么用紧凑分隔而非带字段名（2026-10-29 体积压缩）：一行原来要写
  // `id=1 | 上衣 | 米白 | 季节:春/秋 | 日常 | 风格:温柔/极简`（41 字符），
  // 其中「id=」「季节:」「风格:」与空格都是纯开销——26 件衣橱累计占掉
  // 整段 prompt 的一半以上。字段顺序固定后只需在 system prompt 说明一次，
  // 单行压到 20 余字符。列顺序必须与 SYSTEM_PROMPT 里的说明严格一致。
  const wardrobeLines = wardrobe
    .map((g) => {
      const parts = [g.category, g.color, g.seasons.join('/'), g.formality];
      // 无风格标签时补占位，保证列位置不塌陷
      parts.push(g.styleTags.length ? g.styleTags.join('/') : '-');
      return `${g.id}|${parts.join('|')}`;
    })
    .join('\n');

  const constraintLines = [weatherLine, occasionLine, seasonLine, styleLine]
    .filter(Boolean)
    .join('\n');

  return `${constraintLines}

我的衣橱清单（只能从这里选，每行列依次为：编号|品类|颜色|季节|正式度|风格）：
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
