/**
 * 上传控制器：签发又拍云直传凭证。
 *
 * 受 JwtAuthGuard 保护——保存目录按登录用户 id 隔离，前端无法指定他人目录。
 */

import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { User } from '../prisma/client';
import { SignUploadDto } from './dto/sign-upload.dto';
import { UploadService } from './upload.service';

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private readonly upload: UploadService) {}

  /**
   * 签发一张衣物图的直传凭证。
   * @param user 当前登录用户（JwtAuthGuard 注入）
   * @param dto 文件扩展名
   * @returns 又拍云直传凭证 + 直传后可访问的图片 URL
   */
  @Post('upyun-sign')
  signUpyun(@CurrentUser() user: User, @Body() dto: SignUploadDto) {
    return this.upload.signUpload(user.id, dto.ext);
  }
}
