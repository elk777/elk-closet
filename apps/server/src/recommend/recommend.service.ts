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
  getTimeslot,
  pruneRecommend,
  RECOMMEND_UNLOCK_THRESHOLD,
  seasonOfMonth,
  type Formality,
  type Garment,
  type MatchedOutfits,
  type RecommendInput,
  type RecommendedOutfitView,
  type RecommendWeather,
  type Season,
  type Timeslot,
  type TodayRecommendation,
  type WardrobeBriefItem,
} from '@zhiyi/shared';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { WeatherService } from '../weather/weather.service';
import type { MatchOutfitDto } from './dto/match-outfit.dto';
import type { TodayRecommendDto } from './dto/today-recommend.dto';
import type { Recommendation } from '../prisma/client';

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

    // 当季件数：既是缓存校验依据，也随缓存一起落库
    const season = seasonOfMonth();
    const seasonalCount = garments.filter((g) =>
      (g.seasons as Season[]).includes(season),
    ).length;

    const now = new Date();
    const date = this.cacheDate(now);
    const timeslot = getTimeslot(now);

    // 「换一套」显式绕过缓存：用户要的就是换一个结果，命中缓存等于没反应
    if (!dto.forceRefresh) {
      const cache = await this.findCache(ownerId, date, timeslot);
      if (cache && this.isCacheValid(cache, weather, garments)) {
        return {
          ...base,
          status: 'ok',
          outfits: cache.outfits as unknown as RecommendedOutfitView[],
          // 旧搭配照常展示，仅回传「有新衣物」让首页出提示条
          cacheStale: cache.stale,
        };
      }
    }

    // 组装 AI 输入：衣橱只传摘要（不含图，控 token）
    const wardrobe = this.toBrief(garments);

    const input: RecommendInput = {
      weather: weather ?? undefined,
      occasion: dto.occasion,
      wardrobe,
    } as RecommendInput;

    const outfits = await this.generate(input, garments);

    // 只缓存有结果的生成：empty 多半是模型没搭出来，缓存它等于把失败固化一整个时段
    if (outfits.length > 0) {
      await this.writeCache({
        ownerId,
        date,
        timeslot,
        weather,
        outfits,
        seasonalCount,
      });
    }

    return {
      ...base,
      status: outfits.length > 0 ? 'ok' : 'empty',
      weather,
      outfits,
      cacheStale: false,
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

  /* ──────────────── 今日推荐缓存 ──────────────── */

  /**
   * 取缓存键用的日期（服务器本地时区零点）。
   *
   * 必须与 getTimeslot 同一时区口径：timeslot 读的是本地小时，
   * 若这里用 UTC 零点，东八区 08:00 之前会算进前一天，缓存键与时段错位。
   * @param now 基准时间
   * @returns 当天零点
   */
  private cacheDate(now: Date): Date {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  /**
   * 读当前用户在该日期该时段的缓存。
   *
   * 缓存故障不该阻断推荐：查询异常一律当「没缓存」，退回正常生成路径。
   * @param ownerId 用户 id
   * @param date 缓存日期（本地零点）
   * @param timeslot 时段
   * @returns 缓存记录，无或异常时 null
   */
  private async findCache(
    ownerId: string,
    date: Date,
    timeslot: Timeslot,
  ): Promise<Recommendation | null> {
    try {
      return await this.prisma.recommendation.findUnique({
        where: { ownerId_date_timeslot: { ownerId, date, timeslot } },
      });
    } catch (e) {
      this.logger.warn(`推荐缓存读取失败，降级为重新生成：${String(e)}`);
      return null;
    }
  }

  /**
   * 判断缓存是否还能拿来展示（硬失效判定）。
   *
   * 只拦「结果已经错了」的情形，不拦「结果已经旧了」：
   * - 推荐里的单品被删/归档 → 展示出来就是错的，必须重算
   * - 天气突变 → 厚薄、防雨建议失真，必须重算
   * 而「新增了当季衣物」只是候选池变大、旧搭配依然成立，走 stale 软标记，
   * 由前端出提示条让用户决定何时花那 ~60s（PRD D4/R8）——若在此处判失效，
   * 录入后照样自动重算，提示条永远不会出现，整个缓存改造就白做了。
   *
   * 当季件数不参与判定：件数变化要么源于新增（已由 stale 覆盖），
   * 要么源于删除未被推荐用到的单品（PRD R4 明确不该失效）。
   * @param cache 缓存记录
   * @param weather 当前天气，取不到为 null
   * @param garments 当前在库未闲置衣物
   * @returns 可展示则 true
   */
  private isCacheValid(
    cache: Recommendation,
    weather: RecommendWeather | null,
    garments: Garment[],
  ): boolean {
    // 推荐用到的单品必须都还在：删掉一件就不能再展示这套
    const alive = new Set(garments.map((g) => g.id));
    const usedIds = cache.garmentIds as unknown as string[];
    if (!Array.isArray(usedIds) || usedIds.length === 0) return false;
    if (!usedIds.every((id) => alive.has(id))) return false;

    // 天气突变：温差超 5℃ 或下不下雨翻转，都会让厚薄/防雨判断失真。
    // 一方缺天气则跳过此项——没有可比对象，不该据此判失效。
    const cached = cache.weather as RecommendWeather | null;
    if (weather && cached) {
      if (Math.abs(cached.temp - weather.temp) > 5) return false;
      if (cached.rain > 0 !== weather.rain > 0) return false;
    }

    return true;
  }

  /**
   * 落缓存（同键覆盖）。
   *
   * 与读一致：写失败只告警不抛错——推荐已经生成好了，
   * 因为存不下就把结果丢给用户报错是本末倒置。
   * @param params 缓存键与内容
   */
  private async writeCache(params: {
    ownerId: string;
    date: Date;
    timeslot: Timeslot;
    weather: RecommendWeather | null;
    outfits: RecommendedOutfitView[];
    seasonalCount: number;
  }): Promise<void> {
    const { ownerId, date, timeslot, weather, outfits, seasonalCount } = params;
    // 失效校验只需要 id 列表，从套装里扁平化提取
    const garmentIds = [
      ...new Set(outfits.flatMap((o) => o.items.map((g) => g.id))),
    ];
    const payload = {
      weather: (weather ?? null) as never,
      outfits: outfits as never,
      garmentIds: garmentIds as never,
      seasonalCount,
      stale: false,
    };

    try {
      await this.prisma.recommendation.upsert({
        where: { ownerId_date_timeslot: { ownerId, date, timeslot } },
        create: { ownerId, date, timeslot, ...payload },
        update: payload,
      });
    } catch (e) {
      this.logger.warn(`推荐缓存写入失败，本次结果不落库：${String(e)}`);
    }
  }

  /**
   * 衣橱实体 → AI 摘要项（不含图，控 token）。
   * @param garments 衣物列表
   * @returns 摘要项数组
   */
  private toBrief(garments: Garment[]): WardrobeBriefItem[] {
    return garments.map((g) => ({
      id: g.id,
      // 品类已用户化（可能是自定义分类），摘要按原值直传
      category: g.category,
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
