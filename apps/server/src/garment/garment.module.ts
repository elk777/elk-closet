/**
 * 衣物模块：录入生命线。
 *
 * 依赖：
 * - AiModule：注入 AiService 做识别
 * - AuthModule：JwtAuthGuard 保护路由（并带出 UserService 供 guard 解析）
 * PrismaModule 为全局，无需在此 import。
 */

import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { GarmentController } from './garment.controller';
import { GarmentService } from './garment.service';

@Module({
  imports: [AiModule, AuthModule],
  controllers: [GarmentController],
  providers: [GarmentService],
})
export class GarmentModule {}
