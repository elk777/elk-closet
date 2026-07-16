/**
 * 全局配置模块。
 *
 * 职责：
 * 1. 按 NODE_ENV 分层加载 env 文件（后者覆盖前者，密钥文件优先级最高）
 * 2. 启动即用 Zod 校验全量 env（validateEnv，fail-fast）
 * 3. 注册分命名空间的强类型 config 工厂
 *
 * 一键切换环境：仅靠 NODE_ENV 决定加载哪套 env，业务代码零改动。
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configFactories } from './configuration';
import { validateEnv } from './env.validation';

const NODE_ENV = process.env.NODE_ENV ?? 'development';

/**
 * env 文件加载顺序。
 * @nestjs/config：数组靠前的文件优先级更高（同名 key 不被后者覆盖）。
 * 因此把「本地密钥覆盖」放最前，「共享默认值」放最后：
 *   .env.{NODE_ENV}.local  → 环境专属密钥覆盖（不入库）
 *   .env.local             → 通用密钥覆盖（不入库）
 *   .env.{NODE_ENV}        → 环境专属非敏感值（入库）
 *   .env                   → 全环境共享默认值（入库）
 * 系统环境变量优先级高于所有 .env 文件（生产由部署环境注入密钥）。
 */
const envFilePath = [
  `.env.${NODE_ENV}.local`,
  '.env.local',
  `.env.${NODE_ENV}`,
  '.env',
];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath,
      load: configFactories,
      validate: validateEnv,
      // 已通过 validate 统一校验，无需 @nestjs/config 的内置缓存告警
      cache: true,
      expandVariables: true,
    }),
  ],
})
export class AppConfigModule {}
