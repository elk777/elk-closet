/**
 * 试穿控制器：AI 试穿对外接口（PRD 4.6）。
 *
 * 受 JwtAuthGuard 保护，只对当前用户自己的单品与全身照操作。
 * 用 POST：入参带单品清单，且试穿是「生成」语义（图像编辑，低频）。
 */

import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { TryOnResponse } from '@zhiyi/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { User } from '../prisma/client';
import { SaveBodyPhotoDto } from './dto/save-body-photo.dto';
import { TryOnOutfitDto } from './dto/tryon-outfit.dto';
import { TryOnService } from './tryon.service';

@Controller('tryon')
@UseGuards(JwtAuthGuard)
export class TryOnController {
  constructor(private readonly tryon: TryOnService) {}

  /**
   * 试穿一套：把指定单品合成到用户全身照上，返回上身图。
   * @param user 当前登录用户
   * @param dto 单品 id 清单 + 可选场合/风格
   * @returns 三态试穿结果（no_body / ok / failed）
   */
  @Post('outfit')
  outfit(
    @CurrentUser() user: User,
    @Body() dto: TryOnOutfitDto,
  ): Promise<TryOnResponse> {
    return this.tryon.tryOnOutfit(user.id, dto.itemIds, dto.occasion, dto.style);
  }

  /**
   * 保存/更新当前用户的全身照 URL（前端直传 body 目录后回传，PRD 4.6「只传一次、复用」）。
   * @param user 当前登录用户
   * @param dto 全身照 URL
   * @returns 已保存的全身照 URL
   */
  @Post('body-photo')
  saveBodyPhoto(
    @CurrentUser() user: User,
    @Body() dto: SaveBodyPhotoDto,
  ): Promise<{ bodyPhotoUrl: string }> {
    return this.tryon.saveBodyPhoto(user.id, dto.bodyPhotoUrl);
  }

  /**
   * 一键删除全身照（设置页隐私操作；动作型接口用 POST，小程序无 PATCH/DELETE 惯例）。
   * @param user 当前登录用户
   * @returns 删除结果（幂等）
   */
  @Post('body-photo/remove')
  removeBodyPhoto(@CurrentUser() user: User): Promise<{ removed: boolean }> {
    return this.tryon.removeBodyPhoto(user.id);
  }
}
