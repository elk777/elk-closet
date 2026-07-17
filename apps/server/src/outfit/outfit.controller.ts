/**
 * 穿搭日记控制器（PRD 4.7）。
 *
 * 全部受 JwtAuthGuard 保护，记录归属当前登录用户。
 * 打卡两步：先 guess 预猜用了哪几件（可跳过）→ 用户确认 → create 保存并反哺穿着数。
 */

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { OutfitView } from '@zhiyi/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { User } from '../prisma/client';
import { CreateOutfitDto } from './dto/create-outfit.dto';
import { GuessOutfitDto } from './dto/guess-outfit.dto';
import { OutfitService } from './outfit.service';

@Controller('outfits')
@UseGuards(JwtAuthGuard)
export class OutfitController {
  constructor(private readonly outfits: OutfitService) {}

  /**
   * 预猜打卡照里穿了衣橱哪几件（PRD 4.7 系统预猜）。
   *
   * 尽力而为：AI 猜不出返回空数组，前端降级为「无预选，用户手动选」，不报错。
   * @param user 当前登录用户
   * @param dto 打卡照 URL
   * @returns 命中的衣物 id 列表
   */
  @Post('guess')
  async guess(
    @CurrentUser() user: User,
    @Body() dto: GuessOutfitDto,
  ): Promise<{ itemIds: string[] }> {
    const itemIds = await this.outfits.guess(user.id, dto.photoUrl);
    return { itemIds };
  }

  /**
   * 保存打卡：建记录 + 反哺穿着数（事务）。
   * @param user 当前登录用户
   * @param dto 打卡入参
   * @returns 打卡记录富视图
   */
  @Post()
  create(
    @CurrentUser() user: User,
    @Body() dto: CreateOutfitDto,
  ): Promise<OutfitView> {
    return this.outfits.create(user.id, dto);
  }

  /**
   * 按月列出打卡记录（月历）。
   * @param user 当前登录用户
   * @param year 年
   * @param month 月 1~12
   * @returns 该月打卡记录富视图列表
   */
  @Get()
  listByMonth(
    @CurrentUser() user: User,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ): Promise<OutfitView[]> {
    return this.outfits.listByMonth(user.id, year, month);
  }

  /**
   * 查单条打卡详情。
   * @param user 当前登录用户
   * @param id 打卡记录 id
   * @returns 打卡记录富视图
   */
  @Get(':id')
  detail(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<OutfitView> {
    return this.outfits.detail(user.id, id);
  }
}
