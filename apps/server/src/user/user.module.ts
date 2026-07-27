/**
 * 用户模块：导出 UserService 供 auth 等模块建号/查号，
 * 并承载设置页的账号级接口（衣柜名修改）。
 *
 * 不 import AuthModule（会成模块环）：JwtAuthGuard 的依赖里
 * JwtService 全局注册、ConfigService 全局、UserService 本模块自有，guard 可直接解析。
 */

import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
