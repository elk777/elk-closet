/**
 * 认证模块。
 *
 * JwtModule 全局注册（secret 从配置读），导出 JwtAuthGuard 供各业务模块保护路由。
 *
 * 三种登录方式并存：
 * - dev-login：开发/联调（生产禁用）
 * - wx-login：微信小程序静默登录
 * - email/send-code + email/verify：H5 邮箱验证码登录
 * 三者最终都走 AuthService.buildAuthResult 签发同构 JWT，前端无需按来源分支处理。
 */

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import type { JwtConfig } from '../config/configuration';
import { UserModule } from '../user/user.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailCodeService } from './email-code.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { MailService } from './mail.service';

@Module({
  imports: [
    UserModule,
    // secret / expiresIn 在模块注册时从配置读定，签发与校验统一走这套默认值，
    // 调用点不必再传 options（规避 @nestjs/jwt v11 对 expiresIn 的模板类型约束）。
    // global：JwtService 全局可用——UserModule 等模块用 JwtAuthGuard 时无需
    // 反向 import AuthModule（避免 Auth ↔ User 模块环）。
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const { secret, expiresIn } = config.get<JwtConfig>('jwt')!;
        // expiresIn 运行时接受 '30d' 这类字符串；v11 类型收窄为 ms 的模板字面量，此处显式断言
        const signOptions = { expiresIn } as JwtSignOptions;
        return { secret, signOptions };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, MailService, EmailCodeService],
  // 一并导出 UserModule：JwtAuthGuard 依赖 UserService，
  // 其他模块引入 AuthModule 用 guard 时才能解析到该依赖
  exports: [JwtAuthGuard, JwtModule, UserModule],
})
export class AuthModule {}
