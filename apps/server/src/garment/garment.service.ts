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

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import {
  majorTypeOf,
  type RecognitionResult,
  type ScreenshotExtractResult,
} from '@zhiyi/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { CategoryService, FALLBACK_CATEGORY } from '../category/category.service';
import { UploadService } from '../upload/upload.service';
import type { CreateGarmentDto } from './dto/create-garment.dto';

/** 先存图后补时，缺省属性的兜底值（PRD 5.6.1：不阻塞录入）；品类兜底见 FALLBACK_CATEGORY */
const FALLBACK = {
  name: '待整理衣物',
  mainColor: '未知',
  colorHex: '#CCCCCC',
  thickness: '中',
  seasons: ['春', '夏', '秋', '冬'],
  formality: '日常',
} as const;

/** 商品图裁剪的最小边长（像素）：低于此值多半框到了缩略图/图标而非商品主图 */
const MIN_CROP_PX = 200;

@Injectable()
export class GarmentService {
  private readonly logger = new Logger(GarmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly categories: CategoryService,
    private readonly upload: UploadService,
  ) {}

  /**
   * 识别衣物属性，不入库——供录入确认页预填（PRD 5.5.2）。
   *
   * 品类候选集取自用户分类表（自定义分类要能被 AI 命中就必须进 prompt）；
   * AI 返回不在用户分类集内时归「其他」（与 prompt 内约定一致的双重兜底）。
   * @param ownerId 当前登录用户 id
   * @param imageUrl 又拍云直传后的图 URL
   * @returns 已过 Zod 校验、品类已按用户集裁剪的识别结果
   */
  async recognize(
    ownerId: string,
    imageUrl: string,
  ): Promise<RecognitionResult> {
    const { names, majorTypes } = await this.categories.namesOf(ownerId);
    const result = await this.ai.recognize({ imageUrl, categories: names });
    if (!names.includes(result.category)) {
      return {
        ...result,
        category: FALLBACK_CATEGORY,
        majorType: majorTypeOf(FALLBACK_CATEGORY, majorTypes),
      };
    }
    // majorType 以用户分类表登记的归属为准，防模型答非所问
    return { ...result, majorType: majorTypeOf(result.category, majorTypes) };
  }

  /**
   * 从购物截图提取商品信息，不入库——供录入确认页预填（PRD 4.1 截图导入）。
   *
   * 品类候选集注入与识别一致；categoryGuess 未命中用户分类集时置 null
   * （提取契约允许 null，前端留空由用户自选，不强行归「其他」——
   * 截图场景下模型对品类的判断依据远弱于实物图，宁缺勿错）。
   * 提取成功后再尝试按模型给的 imageBox 裁出干净商品图当主图；
   * 裁剪是锦上添花，任何一步失败只影响 croppedImageUrl（置 null），不影响字段结果。
   * @param ownerId 当前登录用户 id
   * @param imageUrls 又拍云直传后的截图 URL（1~3 张）
   * @returns 提取结果 + 裁出的商品图 URL（裁不出为 null，前端回退整张截图）
   */
  async extractScreenshot(
    ownerId: string,
    imageUrls: string[],
  ): Promise<{
    result: ScreenshotExtractResult;
    croppedImageUrl: string | null;
  }> {
    const { names } = await this.categories.namesOf(ownerId);
    let result = await this.ai.extractFromScreenshot({
      imageUrls,
      categories: names,
    });
    if (result.categoryGuess && !names.includes(result.categoryGuess)) {
      result = { ...result, categoryGuess: null };
    }
    const croppedImageUrl = await this.cropProductImage(
      ownerId,
      imageUrls[0],
      result.imageBox,
    );
    return { result, croppedImageUrl };
  }

  /**
   * 按模型定位的归一化 bbox 从第一张截图裁出衣服图并上传。
   *
   * 模型 bbox 精度未知：sanity check（区域不出图 + 裁后边长不低于
   * MIN_CROP_PX）+ 全链路 catch 兜底 null，保证最坏情况等于现状
   * （整张截图当主图），不会更差。
   * @param ownerId 归属用户 id（上传目录隔离）
   * @param imageUrl 第一张截图 URL
   * @param box 模型给的归一化区域；null 直接跳过
   * @returns 裁剪产物 URL；bbox 不合理或下载/裁剪/上传失败时为 null
   */
  private async cropProductImage(
    ownerId: string,
    imageUrl: string,
    box: ScreenshotExtractResult['imageBox'],
  ): Promise<string | null> {
    if (!box) return null;
    if (box.w <= 0 || box.h <= 0 || box.x + box.w > 1 || box.y + box.h > 1) {
      this.logger.warn(`商品图 bbox 未过 sanity check，跳过裁剪：${JSON.stringify(box)}`);
      return null;
    }
    try {
      const resp = await fetch(imageUrl, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) throw new Error(`截图下载响应 ${resp.status}`);
      const source = Buffer.from(await resp.arrayBuffer());

      const meta = await sharp(source).metadata();
      const { width, height } = meta;
      if (!width || !height) throw new Error('读不到截图尺寸');
      // 门槛按像素而非比例：紧裁到衣服后框本就不大，长截图（如 1280x2781）
      // 里合理的框高占比可能不足 10%，比例门槛会误杀
      if (box.w * width < MIN_CROP_PX || box.h * height < MIN_CROP_PX) {
        this.logger.warn(
          `商品图 bbox 过小（疑似框到缩略图/图标），跳过裁剪：${JSON.stringify(box)}`,
        );
        return null;
      }
      // 归一化 → 像素：四舍五入后 clamp 进图内，防浮点误差把 extract 顶出边界
      const left = Math.min(Math.round(box.x * width), width - 1);
      const top = Math.min(Math.round(box.y * height), height - 1);
      const cropWidth = Math.min(Math.round(box.w * width), width - left);
      const cropHeight = Math.min(Math.round(box.h * height), height - top);

      const cropped = await sharp(source)
        .extract({ left, top, width: cropWidth, height: cropHeight })
        .jpeg({ quality: 90 })
        .toBuffer();
      return await this.upload.putImage(ownerId, cropped, 'garments', 'jpg');
    } catch (err) {
      this.logger.warn(`商品图裁剪失败，回退整张截图：${String(err)}`);
      return null;
    }
  }

  /**
   * 创建衣物。缺省属性用兜底值补齐，支持「先存图后补」。
   *
   * 品类按用户分类表校验：未命中不报错而是归「其他」——与 AI 识别兜底策略
   * 一致，录入生命线不因分类漂移（如刚被删除的分类）而中断。
   * @param ownerId 归属用户 id
   * @param dto 创建入参（属性可全缺省，仅图必填）
   * @returns 新建的衣物
   */
  async create(ownerId: string, dto: CreateGarmentDto) {
    const { names, majorTypes } = await this.categories.namesOf(ownerId);
    const category =
      dto.category && names.includes(dto.category)
        ? dto.category
        : FALLBACK_CATEGORY;
    // majorType 一律按分类表归属推导，保证与 category 一致（防前后端不同步）
    const majorType = majorTypeOf(category, majorTypes);

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
        extra: (dto.extra ?? {}) as object,
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
