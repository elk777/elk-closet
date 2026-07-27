/**
 * 分类控制器：设置页分类管理的对外接口。
 *
 * 全部受 JwtAuthGuard 保护，分类归属当前登录用户（越权一律 404）。
 * 删除用 POST :id/delete——微信小程序不支持 PATCH/DELETE 之外的语义惯例，
 * 项目约定动作型接口一律 POST。
 */

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { User } from '../prisma/client';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';

@Controller('categories')
@UseGuards(JwtAuthGuard)
export class CategoryController {
  constructor(private readonly categories: CategoryService) {}

  /**
   * 列出当前用户全部分类（首次触达自动播种内置模板）。
   * @param user 当前登录用户
   * @returns 分类列表，服装/配饰分组由前端按 majorType 做
   */
  @Get()
  list(@CurrentUser() user: User) {
    return this.categories.list(user.id);
  }

  /**
   * 添加自定义分类。
   * @param user 当前登录用户
   * @param dto 分类名 + 大类
   * @returns 新建的分类
   */
  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateCategoryDto) {
    return this.categories.create(user.id, dto.name, dto.majorType);
  }

  /**
   * 查某分类在用衣物件数（删除确认弹窗明示影响用）。
   * @param user 当前登录用户
   * @param id 分类 id
   * @returns 在用件数
   */
  @Get(':id/usage')
  usage(@CurrentUser() user: User, @Param('id') id: string) {
    return this.categories.usage(user.id, id);
  }

  /**
   * 删除分类：该分类下衣物自动归入「其他」；「其他」本身拒删。
   * @param user 当前登录用户
   * @param id 分类 id
   * @returns 被重指派的衣物件数
   */
  @Post(':id/delete')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.categories.remove(user.id, id);
  }
}
