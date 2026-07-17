/**
 * AiService：业务层调用 AI 的统一入口。
 *
 * 在具体 Provider 之上包一层「重试 + 降级」策略（PRD 5.5.4）：
 * - 识别失败（非法 JSON / Zod 校验不过 / 网络抖动）先自动重试 1 次
 * - 仍失败则抛可识别异常，交由录入流程降级为「先存图，属性稍后补」
 *
 * 业务代码只依赖本 service，不直接碰 Provider，也不感知底层用哪个协议。
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  GuessOutfitResult,
  RecognitionResult,
  RecommendInput,
  RecommendOutput,
} from '@zhiyi/shared';
import {
  AI_PROVIDER,
  type AiProvider,
  type GuessOutfitInput,
  type RecognizeInput,
} from './ai-provider.interface';

/** 识别整体失败（含重试）后抛出，供上层走「先存图后补」降级 */
export class RecognitionFailedError extends Error {
  constructor(cause: unknown) {
    super('AI 识别失败');
    this.name = 'RecognitionFailedError';
    this.cause = cause;
  }
}

/** 推荐整体失败（含重试）后抛出，供上层降级为空推荐（前端提示稍后再试） */
export class RecommendFailedError extends Error {
  constructor(cause: unknown) {
    super('AI 推荐失败');
    this.name = 'RecommendFailedError';
    this.cause = cause;
  }
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
  ) {}

  /**
   * 识别衣物属性，失败自动重试 1 次。
   * @param input 待识别的衣物图
   * @returns 已过 Zod 校验的识别结果
   * @throws RecognitionFailedError 重试后仍失败
   */
  async recognize(input: RecognizeInput): Promise<RecognitionResult> {
    try {
      return await this.provider.recognize(input);
    } catch (first) {
      this.logger.warn(`识别失败，重试一次：${String(first)}`);
      try {
        return await this.provider.recognize(input);
      } catch (second) {
        this.logger.error(`识别重试仍失败：${String(second)}`);
        throw new RecognitionFailedError(second);
      }
    }
  }

  /**
   * 生成搭配推荐，失败自动重试 1 次。
   * @param input 推荐输入（天气 + 衣橱摘要 + 场合）
   * @returns 已过 Zod 校验的推荐结果（itemIds 真实性由上层 pruneRecommend 把关）
   * @throws RecommendFailedError 重试后仍失败
   */
  async recommend(input: RecommendInput): Promise<RecommendOutput> {
    try {
      return await this.provider.recommend(input);
    } catch (first) {
      this.logger.warn(`推荐失败，重试一次：${String(first)}`);
      try {
        return await this.provider.recommend(input);
      } catch (second) {
        this.logger.error(`推荐重试仍失败：${String(second)}`);
        throw new RecommendFailedError(second);
      }
    }
  }

  /**
   * 预猜打卡照里穿了衣橱哪几件（PRD 4.7 系统预猜）。
   *
   * 与识别/推荐不同：这里是「尽力而为」的辅助能力，失败不抛错——
   * 重试 1 次后仍失败则返回空命中，前端降级为「无预选，用户手动选」，
   * 绝不阻塞打卡（打卡摩擦要压到最低，数据飞轮的燃料不能断）。
   * @param input 打卡照 + 候选衣橱清单
   * @returns 命中的衣物 id（真实性由上层 pruneGuess 把关）；失败时为空
   */
  async guessOutfitItems(
    input: GuessOutfitInput,
  ): Promise<GuessOutfitResult> {
    // 候选为空直接短路，不必调模型
    if (input.candidates.length === 0) return { itemIds: [] };
    try {
      return await this.provider.guessOutfitItems(input);
    } catch (first) {
      this.logger.warn(`预猜失败，重试一次：${String(first)}`);
      try {
        return await this.provider.guessOutfitItems(input);
      } catch (second) {
        // 尽力而为：仍失败则空命中降级，不抛错阻塞打卡
        this.logger.warn(`预猜重试仍失败，降级为手动选：${String(second)}`);
        return { itemIds: [] };
      }
    }
  }
}
