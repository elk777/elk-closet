/**
 * 购物截图提取的共用 prompt 与解析兜底。
 *
 * 与识别（recognition.prompt）的本质区别：识别是「看衣服猜属性」，
 * 提取是「读订单/商品页 UI 抄字段」——读不到必须返回 null，禁止推断编造。
 * 共用一份的理由与识别相同：契约与模型无关，Provider 只负责塞进各自协议。
 */

import {
  CATEGORIES,
  ScreenshotExtractSchema,
  type ScreenshotExtractResult,
} from '@zhiyi/shared';

/**
 * 截图提取用的 system prompt（按用户品类候选集动态拼装）。
 * @param categories 品类候选集；缺省用内置模板 CATEGORIES
 * @returns 拼装好的 system prompt
 */
export function buildScreenshotExtractSystemPrompt(
  categories: readonly string[] = CATEGORIES,
): string {
  return `你是购物信息提取助手。用户提供电商 App（淘宝/京东/拼多多等）的订单页或商品详情页截图，从中提取一件服饰商品的信息。

严格要求：
1. 只返回一个 JSON 对象，不要任何解释文字、不要 markdown 代码块。
2. 只抄写截图上实际显示的信息。**截图上没有的字段一律填 null，禁止根据商品图片推断或编造**。
3. name 取商品标题，可整理为适合衣橱展示的简短名称（去掉促销词、店铺名、规格后缀），但不得添加截图上没有的信息。
4. price 取用户实际支付价格（实付款优先；没有实付款时取现售价），单位元，数字类型；有划线原价时不要取划线价。
5. mainColor 取订单规格/SKU 中的颜色文案（如「雾霾蓝 M码」取「雾霾蓝」）；规格里没有颜色则填 null。
6. categoryGuess 从白名单中选：${categories.join(' / ')}；无法判断填 null。
7. 多张截图属于同一件商品，信息互补时合并；互相矛盾时以订单页为准。
8. 如果截图不是购物页面、或无法查看图片：所有字段填 null，confidence 填 0。
9. imageBox 为**第一张截图**中商品展示图（商品照片本身）所在的矩形区域，坐标与宽高均为相对整张截图的 0~1 归一化小数（x/y 为左上角）。只框商品照片，不要框按钮、logo、店铺头像、文字区域；第一张截图里没有商品照片、或位置拿不准时填 null，禁止乱框。
10. confidence 为你对本次提取的整体自评置信度，0~1 的小数。

返回字段：
{
  "name": "羊毛混纺大衣 或 null",
  "brand": "品牌名 或 null",
  "price": 299.5,
  "mainColor": "雾霾蓝 或 null",
  "categoryGuess": "外套 或 null",
  "imageBox": { "x": 0.05, "y": 0.12, "w": 0.28, "h": 0.2 },
  "confidence": 0.9
}`;
}

/** 用户侧提示语（截图随此消息一起传，具体格式由各 Provider 适配） */
export const SCREENSHOT_EXTRACT_USER_PROMPT =
  '请从这些购物截图中提取商品信息，按要求只返回 JSON。';

/**
 * 从模型返回的原始文本中提取 JSON 并过 Zod 校验。
 * 脏输出处理与 parseRecognition 一致：剥代码块围栏 + Zod 拦截。
 * @param raw 模型返回的文本
 * @returns 校验通过的提取结果
 * @throws JSON 解析失败或 Zod 校验不通过时抛错，供上层重试/降级
 */
export function parseScreenshotExtract(raw: string): ScreenshotExtractResult {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const jsonText = (fenced ? fenced[1] : raw).trim();
  const parsed = JSON.parse(jsonText) as unknown;
  return ScreenshotExtractSchema.parse(parsed);
}
