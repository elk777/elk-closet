/**
 * PrismaService：全局唯一的数据库访问入口。
 *
 * Prisma 7 起连接串不再写在 schema，而是运行时经 driver adapter 注入——
 * 这里用 @prisma/adapter-pg 从 ConfigService 拿连接串建 adapter，
 * 连接池、连接参数都由代码/配置掌控（更贴合「可配置、企业级」诉求）。
 *
 * 生命周期挂在 Nest 上：onModuleInit 建连、onModuleDestroy 断连，
 * 避免热重载时连接泄漏。
 */

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './client';
import type { DatabaseConfig } from '../config/configuration';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    const db = config.get<DatabaseConfig>('database');
    super({
      // driver adapter：连接串运行时注入，替代 schema 里的 datasource.url
      adapter: new PrismaPg({ connectionString: db?.url }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('数据库已连接');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
