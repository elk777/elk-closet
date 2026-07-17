/**
 * 推荐控制器：今日推荐对外接口（PRD 4.5）。
 *
 * 受 JwtAuthGuard 保护，只推当前用户自己的衣橱。
 * 用 POST 而非 GET：前端要在 body 里带经纬度/场合，且推荐是「生成」语义。
 */

import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { TodayRecommendation } from '@zhiyi/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { User } from '../prisma/client';
import { TodayRecommendDto } from './dto/today-recommend.dto';
import { RecommendService } from './recommend.service';

@Controller('recommend')
@UseGuards(JwtAuthGuard)
export class RecommendController {
  constructor(private readonly recommend: RecommendService) {}

  /**
   * 今日推荐：结合天气与场合，从用户衣橱搭配 1~3 套。
   * @param user 当前登录用户
   * @param dto 可选经纬度（前端定位）与场合
   * @returns 三态今日推荐
   */
  @Post('today')
  today(
    @CurrentUser() user: User,
    @Body() dto: TodayRecommendDto,
  ): Promise<TodayRecommendation> {
    return this.recommend.today(user.id, dto);
  }
}
