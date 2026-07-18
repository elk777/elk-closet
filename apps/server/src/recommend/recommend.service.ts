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
  type Category,
  type Formality,
  type Garment,
  type RecommendInput,
  type RecommendedOutfitView,
  type Season,
  type TodayRecommendation,
  type WardrobeBriefItem,
} from '@zhiyi/shared';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { WeatherService } from '../weather/weather.service';
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
    const wardrobe: WardrobeBriefItem[] = garments.map((g) => ({
      id: g.id,
      category: g.category as Category,
      color: g.mainColor,
      seasons: g.seasons as Season[],
      formality: g.formality as Formality,
    }));

    const input: RecommendInput = {
      weather: weather ?? undefined,
      occasion: dto.occasion,
      wardrobe,
    } as RecommendInput;

    let outfits: RecommendedOutfitView[] = [];
    try {
      const output = await this.ai.recommend(input);
      // 剔除 AI 编造的、不在衣橱里的 id
      const validIds = new Set(garments.map((g) => g.id));
      const pruned = pruneRecommend(output, validIds);
      // 把 itemIds 回填成完整 Garment，供前端直接渲染
      const byId = new Map(garments.map((g) => [g.id, g]));
      outfits = pruned.outfits.map((o) => ({
        items: o.itemIds
          .map((id) => byId.get(id))
          .filter((g): g is Garment => Boolean(g)),
        occasion: o.occasion,
        styleTag: o.styleTag,
        matchScore: o.matchScore,
        reason: o.reason,
      }));
    } catch (e) {
      // AI 整体失败（含重试）：降级为 empty，前端提示稍后再试，不抛 500
      this.logger.warn(`今日推荐生成失败：${String(e)}`);
    }

    return {
      ...base,
      status: outfits.length > 0 ? 'ok' : 'empty',
      weather,
      outfits,
    };
  }
}
