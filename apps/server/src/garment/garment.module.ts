/**
 * 衣物模块：录入生命线。
 *
 * 依赖：
 * - AiModule：注入 AiService 做识别
 * - AuthModule：JwtAuthGuard 保护路由（并带出 UserService 供 guard 解析）
 * - CategoryModule：注入 CategoryService 做品类校验与 AI 候选集拼装
 * - UploadModule：注入 UploadService，截图裁出的商品图落又拍云（putImage）
 * PrismaModule 为全局，无需在此 import。
 */

import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { CategoryModule } from '../category/category.module';
import { UploadModule } from '../upload/upload.module';
import { GarmentController } from './garment.controller';
import { GarmentService } from './garment.service';

@Module({
  imports: [AiModule, AuthModule, CategoryModule, UploadModule],
  controllers: [GarmentController],
  providers: [GarmentService],
})
export class GarmentModule {}
