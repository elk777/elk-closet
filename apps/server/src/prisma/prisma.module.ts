/**
 * 全局 PrismaModule。
 *
 * 标 @Global：PrismaService 一次注册处处可注入，业务模块无需重复 import，
 * 数据库连接全应用共用一个实例。
 */

import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
