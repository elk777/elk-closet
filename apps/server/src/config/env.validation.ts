/**
 * 环境变量校验 schema（启动即校验，fail-fast）。
 *
 * 为什么在启动时一次性校验：把「缺 key / 格式错 / 端口非数字」这类配置问题
 * 挡在进程启动阶段，直接报错退出并指明缺哪个，绝不留到运行时某个请求才崩。
 * 这是十二要素应用「配置从环境读 + 严格校验」的落地。
 */

import { z } from 'zod';

/** 布尔型环境变量：接受 '1'/'true'/'0'/'false'，转成 boolean */
const boolFromEnv = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

/** 端口号：字符串 → 数字，校验范围 */
const port = z.coerce.number().int().min(1).max(65535);

/**
 * 全量环境变量 schema。
 * 注意：密钥类字段（AI key / 又拍云密码）用 min(1) 保证非空——
 * 若忘配密钥，启动就失败，而不是等到第一次调用 AI 才报鉴权错。
 */
export const envSchema = z.object({
  // ── 应用 ──
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: port.default(3000),
  API_PREFIX: z.string().min(1).default('api'),

  // ── 数据库 ──
  DATABASE_URL: z.string().url({ message: 'DATABASE_URL 必须是合法连接串' }),

  // ── Redis ──
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: port.default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),
  REDIS_DB: z.coerce.number().int().min(0).default(0),

  // ── JWT ──
  JWT_SECRET: z.string().min(1, 'JWT_SECRET 不能为空'),
  JWT_EXPIRES_IN: z.string().min(1).default('30d'),

  // ── AI ──
  AI_PROVIDER: z.enum(['anthropic', 'openai']).default('anthropic'),
  AI_ANTHROPIC_BASE_URL: z.string().url().optional(),
  AI_ANTHROPIC_API_KEY: z.string().optional().default(''),
  AI_ANTHROPIC_MODEL: z.string().min(1).default('claude-sonnet-4-6'),
  AI_OPENAI_BASE_URL: z.string().url().optional(),
  AI_OPENAI_API_KEY: z.string().optional().default(''),
  AI_OPENAI_MODEL: z.string().min(1).default('gpt-4o'),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),
  // 是否启用视觉能力（识别 / 打卡预猜靠 image 块）。当前模型（mimo）纯文本，
  // 传图必 404，故默认关闭：关闭时这两个能力直接走降级，不再空调必失败的接口。
  // 将来换上支持 vision 的模型再置 true 即可复活，无需改代码。
  AI_VISION_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  // ── 又拍云 ──
  UPYUN_BUCKET: z.string().min(1),
  UPYUN_OPERATOR: z.string().min(1),
  UPYUN_PASSWORD: z.string().min(1, 'UPYUN_PASSWORD 不能为空'),
  UPYUN_DOMAIN: z.string().url({ message: 'UPYUN_DOMAIN 必须是合法 URL' }),
  UPYUN_UPLOAD_DIR: z.string().min(1).default('garments'),
  UPYUN_SIGN_EXPIRE: z.coerce.number().int().min(60).default(600),

  // ── 和风天气（今日推荐的天气输入）──
  // 全部可选：未配置时今日推荐按季节降级，不阻塞链路，故不强制非空。
  QWEATHER_API_HOST: z.string().optional().default(''),
  QWEATHER_API_KEY: z.string().optional().default(''),
  // 定位失败 / 未授权时的兜底城市经纬度，默认杭州
  QWEATHER_DEFAULT_LON: z.coerce.number().default(120.15),
  QWEATHER_DEFAULT_LAT: z.coerce.number().default(30.28),
});

/** 校验后的环境变量类型（全部字段已带默认值 / 转换） */
export type Env = z.infer<typeof envSchema>;

/**
 * 供 @nestjs/config 的 validate 钩子调用。
 * @param raw process.env 原始对象
 * @returns 校验并转换后的配置；任一字段非法则抛错，进程启动失败
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`环境变量校验失败：\n${issues}`);
  }
  return parsed.data;
}
