/**
 * 认证接口。
 *
 * - POST /api/auth/dev-login：开发登录（本地/联调，无微信环境即可拿 token）
 * - POST /api/auth/wx-login：微信小程序静默登录（当前留桩）
 * - GET  /api/auth/me：校验 token 并回显当前用户，供前端确认登录态
 */

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '../prisma/client';
import type { AppConfig } from '../config/configuration';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { DevLoginDto } from './dto/dev-login.dto';
import { WxLoginDto } from './dto/wx-login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  /**
   * 开发登录：仅非生产环境开放，防止生产误留免密登录后门。
   */
  @Post('dev-login')
  async devLogin(@Body() dto: DevLoginDto) {
    const app = this.config.get<AppConfig>('app')!;
    if (app.isProduction) {
      throw new ForbiddenException('开发登录在生产环境禁用');
    }
    return this.auth.devLogin(dto.openid);
  }

  /** 微信小程序静默登录（留桩，待前端联调） */
  @Post('wx-login')
  wxLogin(@Body() dto: WxLoginDto) {
    return this.auth.wxMiniLogin(dto.code);
  }

  /** 回显当前登录用户，验证 token 有效 */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: User) {
    return user;
  }
}
