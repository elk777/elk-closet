/**
 * GarmentService：衣物录入与查询的业务核心（PRD 4.1 / 4.2 / 4.3）。
 *
 * 录入主链路：前端直传又拍云拿到图 URL → recognize 识别属性（不入库）
 * → 用户确认 → create 入库。识别失败或用户跳过时，create 走「先存图后补」路径。
 *
 * 数据边界：
 * - 结构化字段落列，seasons / styleTags / extra 落 JSONB
 * - 查询一律过滤软删除（deletedAt 为 null）
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import {
  majorTypeOf,
  type Category,
  type RecognitionResult,
} from '@zhiyi/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import type { CreateGarmentDto } from './dto/create-garment.dto';

/** 先存图后补时，缺省属性的兜底值（PRD 5.6.1：不阻塞录入） */
const FALLBACK = {
  name: '待整理衣物',
  category: '其他',
  mainColor: '未知',
  colorHex: '#CCCCCC',
  thickness: '中',
  seasons: ['春', '夏', '秋', '冬'],
  formality: '日常',
} as const;

@Injectable()
export class GarmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  /**
   * 识别衣物属性，不入库——供录入确认页预填（PRD 5.5.2）。
   * @param imageUrl 又拍云直传后的图 URL
   * @returns 已过 Zod 校验的识别结果
   */
  recognize(imageUrl: string): Promise<RecognitionResult> {
    return this.ai.recognize({ imageUrl });
  }

  /**
   * 创建衣物。缺省属性用兜底值补齐，支持「先存图后补」。
   * @param ownerId 归属用户 id
   * @param dto 创建入参（属性可全缺省，仅图必填）
   * @returns 新建的衣物
   */
  create(ownerId: string, dto: CreateGarmentDto) {
    const category = (dto.category ?? FALLBACK.category) as Category;
    // majorType 缺省时按品类推导，保证与 category 一致（防前后端不同步）
    const majorType = dto.majorType ?? majorTypeOf(category);

    return this.prisma.garment.create({
      data: {
        ownerId,
        name: dto.name ?? FALLBACK.name,
        category,
        majorType,
        mainColor: dto.mainColor ?? FALLBACK.mainColor,
        colorHex: dto.colorHex ?? FALLBACK.colorHex,
        material: dto.material ?? '',
        thickness: dto.thickness ?? FALLBACK.thickness,
        seasons: dto.seasons ?? [...FALLBACK.seasons],
        formality: dto.formality ?? FALLBACK.formality,
        styleTags: dto.styleTags ?? [],
        extra: {},
        originalImageUrl: dto.originalImageUrl,
        cutoutImageUrl: dto.cutoutImageUrl ?? null,
        brand: dto.brand ?? null,
        price: dto.price ?? null,
      },
    });
  }

  /**
   * 列出用户衣橱（排除软删除），按创建时间倒序。
   * @param ownerId 归属用户 id
   */
  list(ownerId: string) {
    return this.prisma.garment.findMany({
      where: { ownerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * 查衣物详情（排除软删除，且校验归属）。
   * @param ownerId 归属用户 id
   * @param id 衣物 id
   * @throws NotFoundException 不存在 / 已删除 / 非本人
   */
  async detail(ownerId: string, id: string) {
    const garment = await this.prisma.garment.findFirst({
      where: { id, ownerId, deletedAt: null },
    });
    if (!garment) {
      throw new NotFoundException('衣物不存在或已删除');
    }
    return garment;
  }

  /**
   * 记一次穿着（PRD 4.7 数据飞轮的起点）：穿着次数 +1，上次穿着日期置为当天。
   *
   * 本版先提供手动「记一次穿着」入口；将来穿搭打卡确认单品后，由打卡链路复用此更新。
   * 先校验归属再更新，防越权改他人衣物。
   * @param ownerId 归属用户 id
   * @param id 衣物 id
   * @returns 更新后的衣物
   */
  async recordWear(ownerId: string, id: string) {
    await this.detail(ownerId, id); // 归属与存在性校验（不存在则抛 404）
    return this.prisma.garment.update({
      where: { id },
      data: {
        wearCount: { increment: 1 },
        lastWornAt: new Date(),
      },
    });
  }

  /**
   * 切换闲置标记（PRD 4.8 断舍离清单）。
   * @param ownerId 归属用户 id
   * @param id 衣物 id
   * @param archived 目标状态：true 标记闲置，false 取消
   * @returns 更新后的衣物
   */
  async setArchived(ownerId: string, id: string, archived: boolean) {
    await this.detail(ownerId, id); // 归属与存在性校验
    return this.prisma.garment.update({
      where: { id },
      data: { archived },
    });
  }
}
