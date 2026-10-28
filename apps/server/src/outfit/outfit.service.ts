/**
 * OutfitService：穿搭日记的业务核心（PRD 4.7 数据飞轮）。
 *
 * 三件事：
 * - guess：取用户在库未闲置衣物作候选，连同打卡照交 AI 预猜穿了哪几件（尽力而为，失败空返回）
 * - create：事务内建打卡记录 + 关联单品，并给每件衣物 wearCount+1、lastWornAt 置为穿着日
 * - 查询：按月列出（月历）、查单条详情
 *
 * 边界与兜底：
 * - itemIds 一律先按「归属当前用户 + 未软删除」过滤，剔除非法/越权/编造 id
 * - 反哺穿着数与建记录放同一事务，保证「有记录必有反哺」，不出现半更新
 * - 打卡本身不依赖 AI/天气：预猜失败可手动选，天气取不到存 null，均不阻塞保存
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  pruneGuess,
  type Garment,
  type Outfit,
  type OutfitView,
  type RecommendWeather,
} from '@zhiyi/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { WeatherService } from '../weather/weather.service';
import type { CreateOutfitDto } from './dto/create-outfit.dto';

@Injectable()
export class OutfitService {
  private readonly logger = new Logger(OutfitService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly weather: WeatherService,
  ) {}

  /**
   * 预猜打卡照里穿了衣橱哪几件。
   * @param ownerId 当前登录用户 id
   * @param photoUrl 打卡照 URL
   * @returns 命中的衣物 id（已剔除非本人/软删除）；预猜失败为空数组
   */
  async guess(ownerId: string, photoUrl: string): Promise<string[]> {
    const garments = (await this.prisma.garment.findMany({
      where: { ownerId, deletedAt: null, archived: false },
      orderBy: { createdAt: 'desc' },
    })) as unknown as Garment[];

    if (garments.length === 0) return [];

    const candidates = garments.map((g) => ({
      id: g.id,
      imageUrl: g.cutoutImageUrl || g.originalImageUrl,
      brief: `${g.category} ${g.mainColor}`,
    }));

    const guess = await this.ai.guessOutfitItems({ photoUrl, candidates });
    // 二次把关：只保留真实存在于候选中的 id
    const validIds = new Set(garments.map((g) => g.id));
    return pruneGuess(guess, validIds);
  }

  /**
   * 创建打卡记录并反哺穿着数（事务）。
   * @param ownerId 当前登录用户 id
   * @param dto 打卡入参
   * @returns 打卡记录富视图（展开单品）
   */
  async create(ownerId: string, dto: CreateOutfitDto): Promise<OutfitView> {
    // 过滤 itemIds：仅归属当前用户且未软删除，防越权/编造
    const validItems =
      dto.itemIds && dto.itemIds.length > 0
        ? ((await this.prisma.garment.findMany({
            where: { id: { in: dto.itemIds }, ownerId, deletedAt: null },
          })) as unknown as Garment[])
        : [];
    const validIds = validItems.map((g) => g.id);

    // 穿着日期：缺省服务端当天（仅取日期部分）
    const wornOn = dto.wornOn ? new Date(dto.wornOn) : new Date();

    // 天气快照：尽力取，取不到存 null，不阻塞
    const weather = await this.weather.getCurrent();

    const created = await this.prisma.$transaction(async (tx) => {
      const outfit = await tx.outfit.create({
        data: {
          ownerId,
          photoUrl: dto.photoUrl,
          wornOn,
          occasion: dto.occasion ?? null,
          source: dto.source ?? 'manual',
          weather: (weather as unknown as object) ?? undefined,
          note: dto.note ?? null,
          items: {
            create: validIds.map((garmentId) => ({ garmentId })),
          },
        },
      });

      // 数据飞轮：每件衣物 wearCount+1、lastWornAt 置为穿着日
      if (validIds.length > 0) {
        await tx.garment.updateMany({
          where: { id: { in: validIds } },
          data: { wearCount: { increment: 1 }, lastWornAt: wornOn },
        });
      }

      return outfit;
    });

    return this.toView(created as unknown as Outfit, validItems);
  }

  /**
   * 按月列出打卡记录（月历用），按穿着日倒序。
   * @param ownerId 当前登录用户 id
   * @param year 年，如 2026
   * @param month 月，1~12
   * @returns 该月打卡记录富视图列表
   */
  async listByMonth(
    ownerId: string,
    year: number,
    month: number,
  ): Promise<OutfitView[]> {
    // [当月 1 日, 次月 1 日) 半开区间，避开时区与月末天数差异
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));

    const rows = await this.prisma.outfit.findMany({
      where: { ownerId, deletedAt: null, wornOn: { gte: start, lt: end } },
      orderBy: { wornOn: 'desc' },
      include: { items: { include: { garment: true } } },
    });

    return rows.map((r) =>
      this.toView(
        r as unknown as Outfit,
        (r as unknown as { items: { garment: Garment }[] }).items.map(
          (i) => i.garment,
        ),
      ),
    );
  }

  /**
   * 查单条打卡详情（校验归属）。
   * @param ownerId 当前登录用户 id
   * @param id 打卡记录 id
   * @throws NotFoundException 不存在 / 已删除 / 非本人
   */
  async detail(ownerId: string, id: string): Promise<OutfitView> {
    const row = await this.prisma.outfit.findFirst({
      where: { id, ownerId, deletedAt: null },
      include: { items: { include: { garment: true } } },
    });
    if (!row) {
      throw new NotFoundException('穿搭记录不存在或已删除');
    }
    return this.toView(
      row as unknown as Outfit,
      (row as unknown as { items: { garment: Garment }[] }).items.map(
        (i) => i.garment,
      ),
    );
  }

  /**
   * 把 Prisma 记录（含天气 JSON、日期）映射为前端富视图。
   * @param row Outfit 行
   * @param items 展开的关联衣物
   */
  private toView(row: Outfit, items: Garment[]): OutfitView {
    return {
      ...row,
      weather: (row.weather as RecommendWeather | null) ?? null,
      items,
    };
  }
}
