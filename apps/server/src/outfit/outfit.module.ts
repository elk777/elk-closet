/**
 * 穿搭日记模块（PRD 4.7 数据飞轮）。
 *
 * 依赖：
 * - AiModule：注入 AiService 做打卡照的单品预猜
 * - WeatherModule：打卡时取天气快照
 * - AuthModule：JwtAuthGuard 保护路由（并带出 UserService 供 guard 解析）
 * PrismaModule 为全局，无需在此 import。
 */

import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { WeatherModule } from '../weather/weather.module';
import { OutfitController } from './outfit.controller';
import { OutfitService } from './outfit.service';

@Module({
  imports: [AiModule, WeatherModule, AuthModule],
  controllers: [OutfitController],
  providers: [OutfitService],
})
export class OutfitModule {}
