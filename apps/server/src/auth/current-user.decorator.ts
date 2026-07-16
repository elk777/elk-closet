/**
 * @CurrentUser() 参数装饰器：在 controller 里直接取到当前登录用户。
 *
 * 用户对象由 JwtAuthGuard 校验 token 后挂到 request.user，
 * 这里把它取出来注入方法参数，避免每个 handler 重复读 request。
 */

import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { User } from '../prisma/client';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as User | undefined;
    if (!user) {
      // 正常流程下 Guard 已保证有 user；到这一步为空说明漏加 Guard，属编程错误
      throw new UnauthorizedException('未认证');
    }
    return user;
  },
);
