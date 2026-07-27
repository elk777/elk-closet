/**
 * 分类模块：用户级品类管理（设置页），并导出 CategoryService
 * 供 garment 模块做录入校验与 AI 识别候选集拼装。
 *
 * 依赖 AuthModule：JwtAuthGuard 保护路由（并带出 UserService 供 guard 解析）。
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';

@Module({
  imports: [AuthModule],
  controllers: [CategoryController],
  providers: [CategoryService],
  exports: [CategoryService],
})
export class CategoryModule {}
