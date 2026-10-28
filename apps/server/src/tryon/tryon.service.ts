/**
 * TryOnService：AI 试穿的编排核心（PRD 4.6「整套一次上身」）。
 *
 * 职责：校验单品归属当前用户 → 取用户全身照（无则返回 no_body 引导）→
 * 组装单品图与简述喂给 AiService → 拿 b64 上身图 → 落又拍云 tryon 目录 → 回填 URL。
 * 三态（no_body / ok / failed）由本服务装配，模型失败不抛到接口层（降级为 failed）。
 */

import { Injectable, Logger } from '@nestjs/common';
import type { TryOnItem, TryOnResponse } from '@zhiyi/shared';
import { AiService, TryOnFailedError } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';

/**
 * 单套试穿单品上限：太多会超模型 16 图上限且易崩。
 * 下限由 TryOnOutfitDto 的 @ArrayMinSize(1) 保证，此处不再校验。
 */
const MAX_TRYON_ITEMS = 8;

@Injectable()
export class TryOnService {
  private readonly logger = new Logger(TryOnService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly upload: UploadService,
  ) {}

  /**
   * 保存/更新用户全身照 URL（前端直传 body 目录后回传，只存一次、复用）。
   * @param ownerId 当前登录用户 id
   * @param bodyPhotoUrl 全身照可访问 URL
   * @returns 已保存的全身照 URL（供前端回显）
   */
  async saveBodyPhoto(
    ownerId: string,
    bodyPhotoUrl: string,
  ): Promise<{ bodyPhotoUrl: string }> {
    await this.prisma.user.update({
      where: { id: ownerId },
      data: { bodyPhotoUrl },
    });
    return { bodyPhotoUrl };
  }

  /**
   * 删除用户全身照（设置页一键删除，兑现试穿页的隐私承诺）。
   *
   * 只清库里的 URL：删除后试穿接口自然回 no_body 引导态。
   * 又拍云上的物理文件本期不删（涉及管理 API，记入遗留）。
   * @param ownerId 当前登录用户 id
   * @returns removed 恒为 true（幂等：本就没有也视为删除成功）
   */
  async removeBodyPhoto(ownerId: string): Promise<{ removed: boolean }> {
    await this.prisma.user.update({
      where: { id: ownerId },
      data: { bodyPhotoUrl: null },
    });
    return { removed: true };
  }

  /**
   * 试穿一套：把指定单品合成到用户全身照上。
   *
   * @param ownerId 当前登录用户 id（单品与全身照均按此隔离，杜绝越权）
   * @param itemIds 本套单品 id（须全部属于当前用户、未软删除）
   * @param occasion 场合软约束，可选
   * @param style 风格软约束，可选
   * @returns 三态试穿结果（no_body / ok / failed）
   */
  async tryOnOutfit(
    ownerId: string,
    itemIds: string[],
    occasion?: string,
    style?: string,
  ): Promise<TryOnResponse> {
    // 1. 取全身照：没传过则引导先上传（含隐私提示由前端展示）
    const user = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { bodyPhotoUrl: true },
    });
    const bodyPhotoUrl = user?.bodyPhotoUrl ?? '';
    if (!bodyPhotoUrl) {
      return { status: 'no_body', imageUrl: '' };
    }

    // 2. 取单品，强制归属当前用户 + 未删除（越权 id 自然被过滤掉）
    const garments = (await this.prisma.garment.findMany({
      where: { id: { in: itemIds }, ownerId, deletedAt: null },
      select: {
        id: true,
        name: true,
        category: true,
        mainColor: true,
        originalImageUrl: true,
        cutoutImageUrl: true,
      },
    })) as GarmentImageRow[];

    // 越权/不存在的 id 被过滤后若没剩下任何单品，无法试穿
    if (garments.length === 0) {
      this.logger.warn(`试穿无有效单品，ownerId=${ownerId}`);
      return { status: 'failed', imageUrl: '' };
    }

    // 3. 组装单品图（抠图优先、回退原图）与简述
    const items: TryOnItem[] = garments.slice(0, MAX_TRYON_ITEMS).map((g) => ({
      imageUrl: g.cutoutImageUrl || g.originalImageUrl,
      brief: `${g.mainColor}${g.category}（${g.name}）`,
    }));

    // 4. 调模型合成 → 落对象存储 → 回填 URL；任一步失败降级为 failed
    try {
      const b64 = await this.ai.tryOn({ bodyPhotoUrl, items, occasion, style });
      const imageUrl = await this.upload.putImage(
        ownerId,
        Buffer.from(b64, 'base64'),
        'tryon',
        'png',
      );
      return { status: 'ok', imageUrl };
    } catch (e) {
      // 图像生成/上传失败不阻塞其他功能，前端提示稍后再试
      const reason = e instanceof TryOnFailedError ? '模型生成失败' : String(e);
      this.logger.error(`试穿失败，降级：${reason}`);
      return { status: 'failed', imageUrl: '' };
    }
  }
}

/** prisma 单品查询的图相关子集（select 后的行形状） */
interface GarmentImageRow {
  id: string;
  name: string;
  category: string;
  mainColor: string;
  originalImageUrl: string;
  cutoutImageUrl: string | null;
}
