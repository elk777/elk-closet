/**
 * 用户控制器：设置页的账号级小操作。
 *
 * 动作型接口用 POST（微信小程序不支持 PATCH，项目既有约束）。
 */

import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { User } from '../prisma/client';
import { UpdateClosetNameDto } from './dto/update-closet-name.dto';
import { UserService } from './user.service';

@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly users: UserService) {}

  /**
   * 修改衣柜名（设置页；首页左上角展示位随之更新）。
   * @param user 当前登录用户
   * @param dto 新衣柜名（DTO 已 trim + 长度校验）
   * @returns 更新后的衣柜名
   */
  @Post('closet-name')
  updateClosetName(@CurrentUser() user: User, @Body() dto: UpdateClosetNameDto) {
    return this.users.updateClosetName(user.id, dto.closetName);
  }
}
