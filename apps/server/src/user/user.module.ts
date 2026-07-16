/**
 * 用户模块：导出 UserService 供 auth 等模块建号/查号。
 */

import { Module } from '@nestjs/common';
import { UserService } from './user.service';

@Module({
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
