/**
 * JwtAuthGuard：校验 Authorization: Bearer <token>，并把用户挂到 request.user。
 *
 * 为什么校验后还查库：token 只带 sub，需实时确认用户仍存在（未注销），
 * 且后续 handler 常要用户完整信息（closetName 等），一次查库省得重复取。
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { JwtConfig } from '../config/configuration';
import { UserService } from '../user/user.service';
import type { JwtPayload } from './jwt-payload.interface';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly users: UserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('缺少认证令牌');
    }

    let payload: JwtPayload;
    try {
      const { secret } = this.config.get<JwtConfig>('jwt')!;
      payload = await this.jwt.verifyAsync<JwtPayload>(token, { secret });
    } catch {
      throw new UnauthorizedException('认证令牌无效或已过期');
    }

    const user = await this.users.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    // 挂到 request，供 @CurrentUser() 取用
    (request as Request & { user?: unknown }).user = user;
    return true;
  }

  /** 从 Authorization 头提取 Bearer token */
  private extractToken(request: Request): string | null {
    const auth = request.headers.authorization;
    if (!auth) return null;
    const [type, token] = auth.split(' ');
    return type === 'Bearer' && token ? token : null;
  }
}
