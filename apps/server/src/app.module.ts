import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { AiModule } from './ai/ai.module';
import { UploadModule } from './upload/upload.module';
import { GarmentModule } from './garment/garment.module';
import { RecommendModule } from './recommend/recommend.module';
import { HealthController } from './health/health.controller';

/**
 * 根模块。
 *
 * 基建模块（全局）：配置（含启动即校验）、Prisma 数据访问、AI 能力。
 * 业务模块：User / Auth / Upload / Garment（录入生命线）/ Recommend（今日推荐）。
 */
@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    UserModule,
    AuthModule,
    AiModule,
    UploadModule,
    GarmentModule,
    RecommendModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
