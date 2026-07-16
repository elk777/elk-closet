/**
 * AiProvider：AI 能力的抽象接口（PRD 5.5.5 落地要点）。
 *
 * 核心原则：契约由我们定死，模型是可替换执行者。
 * 业务层只依赖此接口，不关心背后是 Anthropic 还是 OpenAI 协议——
 * 换模型 / 换协议只改 AI_PROVIDER 配置与对应实现，上层与数据库不动。
 */

import type { RecognitionResult } from '@zhiyi/shared';

/** 注入 AiProvider 实现的 DI token */
export const AI_PROVIDER = Symbol('AI_PROVIDER');

/** 识别入参：一张衣物图 */
export interface RecognizeInput {
  /** 衣物图可公开访问的 URL（对象存储 / CDN） */
  imageUrl: string;
}

/**
 * AI 能力接口。
 *
 * 当前只有识别（录入生命线所需）；recommend / tryOn 后续模块再加，
 * 届时各 Provider 实现补齐即可，接口保持稳定。
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
   * @returns 已过 Zod 校验的结构化识别结果
   */
  recognize(input: RecognizeInput): Promise<RecognitionResult>;
}
