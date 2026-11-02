/**
 * 认证接口。
 *
 * - POST /api/auth/dev-login：开发登录（本地/联调，无微信环境即可拿 token）
 * - POST /api/auth/wx-login：微信小程序静默登录
 * - POST /api/auth/email/send-code：发送邮箱验证码（H5 端）
 * - POST /api/auth/email/verify：邮箱验证码登录（H5 端）
 * - GET  /api/auth/me：校验 token 并回显当前用户，供前端确认登录态
 *
 * 登录类接口不挂 JwtAuthGuard——守卫是按接口显式挂载的（见 me），
 * 不是全局守卫，所以新接口默认开放，无需额外的「公开」标记。
 */

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '../prisma/client';
import type { AppConfig } from '../config/configuration';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { DevLoginDto } from './dto/dev-login.dto';
import { SendCodeDto } from './dto/send-code.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { WxLoginDto } from './dto/wx-login.dto';
import { EmailCodeService } from './email-code.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
    private readonly emailCode: EmailCodeService,
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

  /**
   * 发送邮箱验证码（H5 登录第一步）。
   *
   * 返回 204 而非 200+空对象：这里没有业务数据可回，前端只关心成功与否。
   * 响应体为空也顺带避免暴露「该邮箱是否已注册」——注册与否走同一条成功路径。
   * @param dto 收件邮箱
   * @param ip 请求来源 IP，用于 IP 维度限流
   */
  @Post('email/send-code')
  @HttpCode(HttpStatus.NO_CONTENT)
  async sendEmailCode(@Body() dto: SendCodeDto, @Ip() ip: string) {
    await this.emailCode.sendCode(dto.email, ip);
  }

  /**
   * 邮箱验证码登录（H5 登录第二步）。
   * 首次登录即注册，返回结构与 wx-login 完全一致。
   * @param dto 邮箱 + 6 位验证码
   */
  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  async verifyEmailCode(@Body() dto: VerifyCodeDto) {
    await this.emailCode.verifyCode(dto.email, dto.code);
    return this.auth.emailLogin(dto.email);
  }

  /** 回显当前登录用户，验证 token 有效 */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: User) {
    return user;
  }
}
