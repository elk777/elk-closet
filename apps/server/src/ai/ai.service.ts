/**
 * AiService：业务层调用 AI 的统一入口。
 *
 * 按能力路由分发：每个能力（识别/推荐/预猜）从路由表拿到「渠道 + 模型 + 是否 vision」，
 * 取对应渠道的 Provider 并把 model 作为入参调用；在其上包一层「重试 + 降级」策略（PRD 5.5.4）：
 * - 识别失败（非法 JSON / Zod 校验不过 / 网络抖动）先自动重试 1 次，仍失败抛错走「先存图后补」
 * - 推荐失败重试 1 次仍失败抛错，上层降级为空推荐
 * - 预猜尽力而为，失败重试 1 次仍失败返回空命中，前端手动选
 *
 * vision 判定下放到能力级：某能力路由标 vision=false 时（所选模型不支持传图），
 * 识别/预猜直接降级，不空调必失败的传图接口。推荐纯文本，不涉及 vision。
 *
 * 业务代码只依赖本 service，不直接碰 Provider，也不感知底层用哪个协议 / 哪个渠道。
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GuessOutfitResult,
  RecognitionResult,
  RecommendInput,
  RecommendOutput,
} from '@zhiyi/shared';
import type { AiConfig, AiRouteConfig } from '../config/configuration';
import {
  AI_CHANNELS,
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

  /** 能力 → 路由（渠道 + 模型 + vision）映射，启动时从配置读入 */
  private readonly routes: AiConfig['routes'];

  constructor(
    @Inject(AI_CHANNELS) private readonly channels: Map<string, AiProvider>,
    configService: ConfigService,
  ) {
    this.routes = configService.get<AiConfig>('ai')!.routes;
    // 吃图能力若路由到无 vision 的模型，启动即告警：该能力将持续降级
    for (const ability of ['recognize', 'guess'] as const) {
      if (!this.routes[ability].vision) {
        this.logger.warn(
          `AI 能力「${ability}」路由的模型标记 vision=false：将直接降级、不调用传图接口。` +
            '接入支持 vision 的模型并把该路由 VISION 置 true 即可恢复。',
        );
      }
    }
  }

  /**
   * 取某能力路由对应的 Provider（渠道存在性已由启动校验保证）。
   * @param route 能力路由
   * @returns 该渠道的 Provider 实例
   */
  private providerOf(route: AiRouteConfig): AiProvider {
    return this.channels.get(route.channel)!;
  }

  /**
   * 识别衣物属性，失败自动重试 1 次。
   * @param input 待识别的衣物图
   * @returns 已过 Zod 校验的识别结果
   * @throws RecognitionFailedError 无 vision 能力，或重试后仍失败
   */
  async recognize(input: RecognizeInput): Promise<RecognitionResult> {
    const route = this.routes.recognize;
    // 无 vision：不空调必失败的传图接口，直接抛错走「先存图后补」降级
    if (!route.vision) {
      throw new RecognitionFailedError(
        new Error('识别路由的模型无 vision 能力'),
      );
    }
    const provider = this.providerOf(route);
    try {
      return await provider.recognize(input, route.model);
    } catch (first) {
      this.logger.warn(`识别失败，重试一次：${String(first)}`);
      try {
        return await provider.recognize(input, route.model);
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
    const route = this.routes.recommend;
    const provider = this.providerOf(route);
    try {
      return await provider.recommend(input, route.model);
    } catch (first) {
      this.logger.warn(`推荐失败，重试一次：${String(first)}`);
      try {
        return await provider.recommend(input, route.model);
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
    const route = this.routes.guess;
    // 无 vision 或 候选为空：直接短路，不调模型，前端降级为手动选
    if (!route.vision) return { itemIds: [] };
    if (input.candidates.length === 0) return { itemIds: [] };
    const provider = this.providerOf(route);
    try {
      return await provider.guessOutfitItems(input, route.model);
    } catch (first) {
      this.logger.warn(`预猜失败，重试一次：${String(first)}`);
      try {
        return await provider.guessOutfitItems(input, route.model);
      } catch (second) {
        // 尽力而为：仍失败则空命中降级，不抛错阻塞打卡
        this.logger.warn(`预猜重试仍失败，降级为手动选：${String(second)}`);
        return { itemIds: [] };
      }
    }
  }
}
