// Prisma CLI 配置（migrate / generate / studio 读此文件拿连接串）。
//
// 为什么手动分层加载 env：Prisma CLI 默认只读 .env，但我们的连接串放在
// .env.development / .env.production 里（按环境分层）。这里复刻应用侧
// config.module.ts 的加载顺序，保证「CLI 迁移」与「运行时应用」连的是同一个库。
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

const NODE_ENV = process.env.NODE_ENV ?? 'development';

// 加载顺序：靠前的先加载、先到先得（dotenv 不覆盖已存在的变量）。
// 与 config.module.ts 一致：本地密钥覆盖 > 环境专属 > 共享默认。
for (const path of [
  `.env.${NODE_ENV}.local`,
  '.env.local',
  `.env.${NODE_ENV}`,
  '.env',
]) {
  loadEnv({ path });
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
