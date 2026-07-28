/**
 * AiService：业务层调用 AI 的统一入口。
 *
 * 按能力路由分发：每个能力（识别/推荐/预猜/试穿）从路由表拿到「渠道 + 模型 + 是否 vision」，
 * 取对应渠道的 Provider 并把 model 作为入参调用；在其上包一层「主备切换/重试 + 降级」策略（PRD 5.5.4）：
 * - 配了兜底路由（AI_ROUTE_*__FALLBACK_*）：主「渠道+模型」失败直接切兜底再试一次
 * - 未配兜底：失败后同路由重试 1 次（历史行为）
 * - 仍失败按能力降级：识别抛错走「先存图后补」，推荐/试穿抛错提示稍后再试，预猜返回空命中手动选
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
  TryOnInput,
} from '@zhiyi/shared';
import type {
  AiAbility,
  AiConfig,
  AiRouteConfig,
} from '../config/configuration';
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

/** 试穿整体失败（含重试）后抛出，供上层降级为「生成失败，稍后再试」 */
export class TryOnFailedError extends Error {
  constructor(cause: unknown) {
    super('AI 试穿失败');
    this.name = 'TryOnFailedError';
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
   * 按「主路由 → 兜底路由」策略执行一次 AI 调用。
   *
   * - 未配兜底：主路由失败后同路由重试 1 次（保持历史行为）。
   * - 配了兜底：主路由失败直接切兜底「渠道+模型」再试 1 次——不在主路由上
   *   重试，因为公益站/中转站的失败多为上游按模型维度失效，原地重试大概率还挂。
   * 两条路径都失败时抛最后一次的错误，由调用方按各能力语义降级。
   *
   * @param ability 能力名（用于路由查表与日志）
   * @param invoke 实际调用：拿到 Provider 与 model 发起请求
   * @returns invoke 的成功结果
   */
  private async callWithFallback<T>(
    ability: AiAbility,
    invoke: (provider: AiProvider, model: string) => Promise<T>,
  ): Promise<T> {
    const route = this.routes[ability];
    try {
      return await invoke(this.providerOf(route), route.model);
    } catch (first) {
      const fb = route.fallback;
      if (!fb) {
        this.logger.warn(`${ability} 失败，同路由重试一次：${String(first)}`);
        return await invoke(this.providerOf(route), route.model);
      }
      this.logger.warn(
        `${ability} 主路由失败（${route.channel}/${route.model}），` +
          `切换兜底（${fb.channel}/${fb.model}）：${String(first)}`,
      );
      return await invoke(this.channels.get(fb.channel)!, fb.model);
    }
  }

  /**
   * 识别前预检：衣物图 URL 必须可访问才值得调模型。
   *
   * 动因（2026-07-28 故障复盘）：CDN 挂掉时部分模型（如 kimi）抓不到图
   * 不报错，而是照 prompt 编造一份像模像样的假结果污染确认页。
   * 花几百毫秒 HEAD 一次，图挂了立即走「先存图后补」降级，诚实且省 20s 模型耗时。
   * @param imageUrl 待识别的衣物图 URL
   * @throws Error 图片不可达（非 2xx/3xx 或超时）
   */
  private async assertImageReachable(imageUrl: string): Promise<void> {
    try {
      const resp = await fetch(imageUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) {
        throw new Error(`图片响应 ${resp.status}`);
      }
    } catch (err) {
      throw new Error(`衣物图不可访问，跳过模型调用：${String(err)}`);
    }
  }

  /**
   * 识别衣物属性，主路由失败自动重试/切兜底（见 callWithFallback）。
   * @param input 待识别的衣物图
   * @returns 已过 Zod 校验的识别结果
   * @throws RecognitionFailedError 无 vision 能力、图不可达，或主备均失败
   */
  async recognize(input: RecognizeInput): Promise<RecognitionResult> {
    const route = this.routes.recognize;
    // 无 vision：不空调必失败的传图接口，直接抛错走「先存图后补」降级
    if (!route.vision) {
      throw new RecognitionFailedError(
        new Error('识别路由的模型无 vision 能力'),
      );
    }
    // 图不可达：模型看不到图会编造假结果，预检失败直接降级
    try {
      await this.assertImageReachable(input.imageUrl);
    } catch (err) {
      this.logger.warn(String(err));
      throw new RecognitionFailedError(err);
    }
    try {
      return await this.callWithFallback('recognize', (p, model) =>
        p.recognize(input, model),
      );
    } catch (err) {
      this.logger.error(`识别主备均失败：${String(err)}`);
      throw new RecognitionFailedError(err);
    }
  }

  /**
   * 生成搭配推荐，主路由失败自动重试/切兜底（见 callWithFallback）。
   * @param input 推荐输入（天气 + 衣橱摘要 + 场合）
   * @returns 已过 Zod 校验的推荐结果（itemIds 真实性由上层 pruneRecommend 把关）
   * @throws RecommendFailedError 主备均失败
   */
  async recommend(input: RecommendInput): Promise<RecommendOutput> {
    try {
      return await this.callWithFallback('recommend', (p, model) =>
        p.recommend(input, model),
      );
    } catch (err) {
      this.logger.error(`推荐主备均失败：${String(err)}`);
      throw new RecommendFailedError(err);
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
    try {
      return await this.callWithFallback('guess', (p, model) =>
        p.guessOutfitItems(input, model),
      );
    } catch (err) {
      // 尽力而为：主备均失败则空命中降级，不抛错阻塞打卡
      this.logger.warn(`预猜主备均失败，降级为手动选：${String(err)}`);
      return { itemIds: [] };
    }
  }

  /**
   * AI 试穿：把整套单品合成到用户全身照上，主路由失败自动重试/切兜底（PRD 4.6）。
   *
   * 图像生成不稳定（超时/内容策略拒绝/网关抖动），主备均失败则抛错，
   * 上层降级为「试穿失败，请稍后再试」，不阻塞其他功能。
   * @param input 全身照 + 本套单品图 + 可选场合/风格
   * @returns 合成上身图的 base64（不含 data: 前缀）
   * @throws TryOnFailedError 主备均失败
   */
  async tryOn(input: TryOnInput): Promise<string> {
    try {
      return await this.callWithFallback('tryon', (p, model) =>
        p.tryOn(input, model),
      );
    } catch (err) {
      this.logger.error(`试穿主备均失败：${String(err)}`);
      throw new TryOnFailedError(err);
    }
  }
}
