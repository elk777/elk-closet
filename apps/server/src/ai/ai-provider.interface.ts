/**
 * AiProvider：AI 能力的抽象接口（PRD 5.5.5 落地要点）。
 *
 * 核心原则：契约由我们定死，模型是可替换执行者。
 * 业务层只依赖此接口，不关心背后是 Anthropic 还是 OpenAI 协议——
 * 换模型只改对应能力路由（AI_ROUTE_*），加渠道只加渠道表（AI_CHANNEL_*），
 * 上层与数据库不动。
 */

import type {
  GuessOutfitResult,
  RecognitionResult,
  RecommendInput,
  RecommendOutput,
  ScreenshotExtractResult,
  TryOnInput,
  TryOnResult,
} from '@zhiyi/shared';

/**
 * 渠道注册表的 DI token。
 *
 * 注入类型为 `Map<渠道名, AiProvider>`：启动时按渠道表逐条 new 出 Provider 实例。
 * 上层 AiService 按能力路由取对应渠道的 Provider，并把该能力的 model 作为调用入参传入。
 */
export const AI_CHANNELS = Symbol('AI_CHANNELS');

/**
 * Provider 构造参数：一个渠道的 client 连接参数。
 *
 * 不含 model——Provider 按渠道建一个可复用的 client，model 由各能力调用时传入。
 */
export interface AiClientOptions {
  baseUrl?: string;
  apiKey: string;
  /** 渠道 client 默认超时（毫秒），可被 AiCallOptions.timeoutMs 按调用覆盖 */
  timeoutMs: number;
  /**
   * 可选 HTTP(S) 代理 URL（如 http://127.0.0.1:7890）。
   * 仅本机开发连需代理的中转站时用，生产直连留空——配了则给 SDK 挂 undici ProxyAgent。
   */
  proxyUrl?: string;
}

/**
 * 单次能力调用的可选项（由 AiService 从能力路由解析后传入）。
 *
 * 与 AiClientOptions 的分工：client 级 timeoutMs 是渠道默认值（AI_TIMEOUT_MS，
 * 为最慢的图像生成而设），本选项按能力覆盖单次调用——如识别配 30s，
 * 主模型卡死时能赶在客户端超时前切兜底返回，不被全局超时拖死
 * （客户端普通请求 60s、识别/截图 180s，均有能力级超时兜住）。
 *
 * 实现约定：配了 timeoutMs 的调用必须同时关闭 SDK 内建重试（默认 2 次，
 * 会把超时预算翻三倍；主备兜底已由 AiService 承担，原地重试无增量价值）。
 */
export interface AiCallOptions {
  /** 本次调用的超时（毫秒），覆盖渠道 client 默认值 */
  timeoutMs?: number;
}

/** 识别入参：一张衣物图 + 该用户的品类候选集 */
export interface RecognizeInput {
  /** 衣物图可公开访问的 URL（对象存储 / CDN） */
  imageUrl: string;
  /**
   * 品类候选集：来自用户分类表（自定义分类要能被 AI 识别命中，就必须进 prompt）。
   * 缺省时 prompt 回退内置模板 CATEGORIES。
   */
  categories?: readonly string[];
}

/** 截图提取入参：同一件商品的 1~3 张购物截图 + 用户品类候选集 */
export interface ScreenshotExtractInput {
  /** 截图可公开访问的 URL（对象存储 / CDN），多张信息互补 */
  imageUrls: string[];
  /** 品类候选集，语义同 RecognizeInput.categories */
  categories?: readonly string[];
}

/** 预猜候选：衣橱里一件衣物的最小标识（id + 图 + 简述），供多图视觉比对 */
export interface GuessCandidate {
  /** 衣物 id，模型据此回填命中结果 */
  id: string;
  /** 衣物图 URL（抠图优先，回退原图） */
  imageUrl: string;
  /** 一句话简述（品类+主色），辅助模型在图不清时判断 */
  brief: string;
}

/** 预猜入参：一张打卡照 + 衣橱候选清单 */
export interface GuessOutfitInput {
  /** 打卡美照 URL */
  photoUrl: string;
  /** 候选衣物清单（通常为该用户在库未闲置衣物） */
  candidates: GuessCandidate[];
}

/**
 * AI 能力接口。
 *
 * 识别（录入生命线）+ 推荐（今日推荐，PRD 4.5）+ 预猜（PRD 4.7）+ 试穿（PRD 4.6）。
 * 试穿是图像生成能力，仅支持图像编辑的协议（openai / gpt-image）能实现；
 * 不支持的协议实现里显式抛错，接口保持完整。
 */
export interface AiProvider {
  /**
   * 识别衣物属性（PRD 5.5.2）。
   *
   * 实现约定：
   * - 强制模型按 RecognitionResultSchema 返回 JSON（能开 structured output 就开）
   * - 返回前必须过 Zod 校验（永不信任 AI 原始输出）
   * - 非法枚举归「其他」，解析失败重试 1 次后仍失败则抛错
   *
   * @param input 待识别的衣物图
   * @param model 本次调用使用的模型名（由能力路由传入，Provider 不再焊死单一 model）
   * @param opts 单次调用选项（能力级超时等），缺省用渠道 client 默认值
   * @returns 已过 Zod 校验的结构化识别结果
   */
  recognize(
    input: RecognizeInput,
    model: string,
    opts?: AiCallOptions,
  ): Promise<RecognitionResult>;

  /**
   * 从购物截图提取商品信息（PRD 4.1「从截图/订单导入」）。
   *
   * 实现约定：
   * - 多张截图放同一次 vision 调用（同一件商品，信息互补）
   * - 强制按 ScreenshotExtractSchema 返回 JSON，返回前过 Zod 校验
   * - 防编造：读不到的字段为 null（schema 与 prompt 双重约束）
   *
   * @param input 购物截图 + 品类候选集
   * @param model 本次调用使用的模型名（由能力路由传入）
   * @param opts 单次调用选项（能力级超时等），缺省用渠道 client 默认值
   * @returns 已过 Zod 校验的提取结果
   */
  extractScreenshot(
    input: ScreenshotExtractInput,
    model: string,
    opts?: AiCallOptions,
  ): Promise<ScreenshotExtractResult>;

  /**
   * 生成搭配推荐（PRD 4.5「私人造型师」）。
   *
   * 实现约定：
   * - 输入为已组装的衣橱摘要 + 天气 + 场合，纯文本对话（无需 vision）
   * - 强制模型按 RecommendOutputSchema 返回 JSON
   * - 返回前过 Zod 校验；itemIds 是否真实存在由上层 pruneRecommend 二次把关
   * - 解析失败重试 1 次后仍失败则抛错
   *
   * @param input 推荐输入契约（衣橱摘要 / 天气 / 偏好）
   * @param model 本次调用使用的模型名（由能力路由传入）
   * @param opts 单次调用选项（能力级超时等），缺省用渠道 client 默认值
   * @returns 已过 Zod 校验的推荐结果
   */
  recommend(
    input: RecommendInput,
    model: string,
    opts?: AiCallOptions,
  ): Promise<RecommendOutput>;

  /**
   * 预猜打卡照里穿了衣橱哪几件（PRD 4.7 系统预猜）。
   *
   * 实现约定：
   * - 打卡照 + 候选单品图一起走多图 vision，让模型指出命中的 id
   * - 强制按 GuessOutfitResultSchema 返回 JSON，返回前过 Zod 校验
   * - itemIds 真实性由上层 pruneGuess 二次把关
   * - 尽力而为：解析失败重试 1 次后仍失败则抛错，上层降级为「空预选，用户手动选」
   *
   * @param input 打卡照 + 候选衣橱清单
   * @param model 本次调用使用的模型名（由能力路由传入）
   * @param opts 单次调用选项（能力级超时等），缺省用渠道 client 默认值
   * @returns 已过 Zod 校验的预猜结果（命中的衣物 id）
   */
  guessOutfitItems(
    input: GuessOutfitInput,
    model: string,
    opts?: AiCallOptions,
  ): Promise<GuessOutfitResult>;

  /**
   * AI 试穿：把整套单品合成到用户全身照上（PRD 4.6「整套一次上身」）。
   *
   * 实现约定：
   * - 图像编辑能力：全身照作底图 + 各单品图 + 指令，一次合成上身效果
   * - 返回合成图的 base64（由上层落对象存储后回填 URL，Provider 不碰存储）
   * - 图像生成不稳定，失败/超时的重试与降级由上层 AiService 处理
   * - 不支持图像编辑的协议（如 anthropic）实现里显式抛错
   *
   * @param input 全身照 + 本套单品图（含简述）+ 可选场合/风格
   * @param model 本次调用使用的模型名（由能力路由传入，如 gpt-image-* 系列）
   * @param opts 单次调用选项（能力级超时等），缺省用渠道 client 默认值
   * @returns 合成上身图的 base64（不含 data: 前缀）
   */
  tryOn(input: TryOnInput, model: string, opts?: AiCallOptions): Promise<string>;
}
