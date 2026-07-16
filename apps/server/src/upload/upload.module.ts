/**
 * 上传模块。
 *
 * 依赖 AuthModule 的 JwtAuthGuard 保护签名接口；只对外提供签名能力，
 * 不碰又拍云密码明文——密码留在服务端算签名，前端拿凭证直传。
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

@Module({
  imports: [AuthModule],
  controllers: [UploadController],
  providers: [UploadService],
})
export class UploadModule {}
