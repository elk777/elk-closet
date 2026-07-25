/**
 * 试穿模块：AI 试穿编排（PRD 4.6）。
 *
 * 依赖：
 * - AiModule：注入 AiService 调图像模型合成上身效果
 * - UploadModule：注入 UploadService 把生成的 b64 图落又拍云
 * - AuthModule：JwtAuthGuard 保护路由（并带出 UserService 供 guard 解析）
 * 全身照存取直接走 PrismaService（全局），无需额外依赖 UserModule。
 */

import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { UploadModule } from '../upload/upload.module';
import { TryOnController } from './tryon.controller';
import { TryOnService } from './tryon.service';

@Module({
  imports: [AiModule, UploadModule, AuthModule],
  controllers: [TryOnController],
  providers: [TryOnService],
})
export class TryOnModule {}
