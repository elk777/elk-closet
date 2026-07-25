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
  timeoutMs: number;
  /**
   * 可选 HTTP(S) 代理 URL（如 http://127.0.0.1:7890）。
   * 仅本机开发连需代理的中转站时用，生产直连留空——配了则给 SDK 挂 undici ProxyAgent。
   */
  proxyUrl?: string;
}

/** 识别入参：一张衣物图 */
export interface RecognizeInput {
  /** 衣物图可公开访问的 URL（对象存储 / CDN） */
  imageUrl: string;
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
   * @returns 已过 Zod 校验的结构化识别结果
   */
  recognize(input: RecognizeInput, model: string): Promise<RecognitionResult>;

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
   * @returns 已过 Zod 校验的推荐结果
   */
  recommend(input: RecommendInput, model: string): Promise<RecommendOutput>;

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
   * @returns 已过 Zod 校验的预猜结果（命中的衣物 id）
   */
  guessOutfitItems(
    input: GuessOutfitInput,
    model: string,
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
   * @param model 本次调用使用的模型名（由能力路由传入，如 gpt-image-2）
   * @returns 合成上身图的 base64（不含 data: 前缀）
   */
  tryOn(input: TryOnInput, model: string): Promise<string>;
}
