/**
 * RecommendService：今日推荐的业务编排（PRD 4.5）。
 *
 * 一条链路串起三方能力：
 *   衣橱数据（Prisma）→ 天气（WeatherService）→ 造型师（AiService）
 *
 * 关键设计：
 * - 件数不足（< 解锁阈值）直接返回 locked，不白调 AI，省 token
 * - 天气取不到不阻塞：weather=null 时 prompt 让模型按季节降级
 * - AI 只拿衣橱「摘要」（不含图，控 token）；返回后 pruneRecommend 剔除编造 id，
 *   再把合法 id 回填成完整 Garment（前端要图与名称）
 * - 只喂在库、未闲置的衣物：闲置件不参与推荐（呼应断舍离语义）
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  pruneRecommend,
  RECOMMEND_UNLOCK_THRESHOLD,
  seasonOfMonth,
  type Category,
  type Formality,
  type Garment,
  type MatchedOutfits,
  type RecommendInput,
  type RecommendedOutfitView,
  type Season,
  type TodayRecommendation,
  type WardrobeBriefItem,
} from '@zhiyi/shared';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { WeatherService } from '../weather/weather.service';
import type { MatchOutfitDto } from './dto/match-outfit.dto';
import type { TodayRecommendDto } from './dto/today-recommend.dto';

@Injectable()
export class RecommendService {
  private readonly logger = new Logger(RecommendService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly weather: WeatherService,
  ) {}

  /**
   * 生成今日推荐。
   * @param ownerId 当前登录用户 id
   * @param dto 可选经纬度与场合
   * @returns 三态结果（locked / ok / empty），前端据 status 分支渲染
   */
  async today(
    ownerId: string,
    dto: TodayRecommendDto,
  ): Promise<TodayRecommendation> {
    // 只取在库、未闲置的衣物参与推荐
    const garments = (await this.prisma.garment.findMany({
      where: { ownerId, deletedAt: null, archived: false },
      orderBy: { createdAt: 'desc' },
    })) as unknown as Garment[];

    const garmentCount = garments.length;

    // 天气与推荐解耦：天气是独立的增强信息，无论是否解锁都先取，
    // 让用户一进页面（哪怕衣橱还没满）就能看到今日实况。取不到返回 null。
    const weather = await this.weather.getCurrent(dto.lon, dto.lat);

    const base = {
      garmentCount,
      unlockThreshold: RECOMMEND_UNLOCK_THRESHOLD,
      weather,
    };

    // 件数不足：不调 AI，直接引导继续添加（但天气照常返回）
    if (garmentCount < RECOMMEND_UNLOCK_THRESHOLD) {
      return { ...base, status: 'locked', outfits: [] };
    }

    // 组装 AI 输入：衣橱只传摘要（不含图，控 token）
    const wardrobe = this.toBrief(garments);

    const input: RecommendInput = {
      weather: weather ?? undefined,
      occasion: dto.occasion,
      wardrobe,
    } as RecommendInput;

    const outfits = await this.generate(input, garments);

    return {
      ...base,
      status: outfits.length > 0 ? 'ok' : 'empty',
      weather,
      outfits,
    };
  }

  /**
   * 智能搭配：按 场合 / 风格 / 季节 维度从衣橱搭配 1~3 套（PRD 4.5）。
   *
   * 与 today 同构，差异：
   * - 不绑天气：搭配由用户选的维度决定，季节维度更权威
   * - 季节硬过滤：只把当季衣物喂给 AI，更准且省 token；当季不足则返回 thin
   * - occasion / style 作 prompt 软约束
   *
   * @param ownerId 当前登录用户 id
   * @param dto 场合 / 风格 / 季节维度（均可选，season 缺省按当前月份推断）
   * @returns 四态结果（locked / thin / ok / empty）
   */
  async matchOutfits(
    ownerId: string,
    dto: MatchOutfitDto,
  ): Promise<MatchedOutfits> {
    const garments = (await this.prisma.garment.findMany({
      where: { ownerId, deletedAt: null, archived: false },
      orderBy: { createdAt: 'desc' },
    })) as unknown as Garment[];

    const garmentCount = garments.length;
    // 季节：用户显式选则用之，否则按服务器当前月份推断
    const season = dto.season ?? seasonOfMonth();

    const base = {
      garmentCount,
      unlockThreshold: RECOMMEND_UNLOCK_THRESHOLD,
      season,
    };

    // 整个衣橱件数不足：引导继续添加，不调 AI
    if (garmentCount < RECOMMEND_UNLOCK_THRESHOLD) {
      return { ...base, status: 'locked', outfits: [] };
    }

    // 季节硬过滤：只保留标注了该季节的衣物（当季衣物才参与搭配）
    const seasonal = garments.filter((g) =>
      (g.seasons as Season[]).includes(season),
    );

    // 当季衣物不足以搭出一套：提示换季节或添当季衣物，不白调 AI
    if (seasonal.length < RECOMMEND_UNLOCK_THRESHOLD) {
      return { ...base, status: 'thin', outfits: [] };
    }

    const input: RecommendInput = {
      occasion: dto.occasion,
      style: dto.style,
      season,
      wardrobe: this.toBrief(seasonal),
    } as RecommendInput;

    const outfits = await this.generate(input, seasonal);

    return {
      ...base,
      status: outfits.length > 0 ? 'ok' : 'empty',
      outfits,
    };
  }

  /**
   * 衣橱实体 → AI 摘要项（不含图，控 token）。
   * @param garments 衣物列表
   * @returns 摘要项数组
   */
  private toBrief(garments: Garment[]): WardrobeBriefItem[] {
    return garments.map((g) => ({
      id: g.id,
      category: g.category as Category,
      color: g.mainColor,
      seasons: g.seasons as Season[],
      formality: g.formality as Formality,
      styleTags: g.styleTags,
    }));
  }

  /**
   * 调 AI 出搭配并回填成完整 Garment（今日推荐与智能搭配共用）。
   *
   * 剔除 AI 编造的 id（pruneRecommend），再把合法 id 展开为完整衣物供前端渲染。
   * AI 整体失败（含重试）不抛错，返回空数组，由上层降级为 empty。
   *
   * @param input 推荐输入
   * @param pool 本次可选衣物（用于校验 id 真实性 + 回填），今日推荐为全量、智能搭配为当季
   * @returns 回填好的套装列表；失败时为空
   */
  private async generate(
    input: RecommendInput,
    pool: Garment[],
  ): Promise<RecommendedOutfitView[]> {
    try {
      const output = await this.ai.recommend(input);
      const validIds = new Set(pool.map((g) => g.id));
      const pruned = pruneRecommend(output, validIds);
      const byId = new Map(pool.map((g) => [g.id, g]));
      return pruned.outfits.map((o) => ({
        items: o.itemIds
          .map((id) => byId.get(id))
          .filter((g): g is Garment => Boolean(g)),
        occasion: o.occasion,
        styleTag: o.styleTag,
        matchScore: o.matchScore,
        reason: o.reason,
      }));
    } catch (e) {
      this.logger.warn(`搭配生成失败：${String(e)}`);
      return [];
    }
  }
}
