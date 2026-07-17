/**
 * 推荐模块：今日推荐编排（PRD 4.5）。
 *
 * 依赖：
 * - AiModule：注入 AiService 调造型师做搭配
 * - WeatherModule：注入 WeatherService 取实时天气（取不到则降级）
 * - AuthModule：JwtAuthGuard 保护路由（并带出 UserService 供 guard 解析）
 * PrismaModule 为全局，无需在此 import。
 */

import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { WeatherModule } from '../weather/weather.module';
import { RecommendController } from './recommend.controller';
import { RecommendService } from './recommend.service';

@Module({
  imports: [AiModule, WeatherModule, AuthModule],
  controllers: [RecommendController],
  providers: [RecommendService],
})
export class RecommendModule {}
