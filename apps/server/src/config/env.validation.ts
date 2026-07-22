/**
 * 环境变量校验 schema（启动即校验，fail-fast）。
 *
 * 为什么在启动时一次性校验：把「缺 key / 格式错 / 端口非数字」这类配置问题
 * 挡在进程启动阶段，直接报错退出并指明缺哪个，绝不留到运行时某个请求才崩。
 * 这是十二要素应用「配置从环境读 + 严格校验」的落地。
 */

import { z } from 'zod';

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
  // 渠道表（AI_CHANNEL_*__*）与能力路由（AI_ROUTE_*__*）是动态前缀，
  // 固定 key 的 z.object 覆盖不了，改由下方 validateAiConfig 单独校验。
  // 这里只校验全局超时。
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),

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

/** 合法协议集合，与 configuration.ts 的 AiProtocol 保持一致 */
const AI_PROTOCOLS = ['anthropic', 'openai'] as const;
/** 必须齐全的能力路由，与 configuration.ts 的 AiAbility 保持一致 */
const AI_ABILITIES = ['RECOGNIZE', 'RECOMMEND', 'GUESS'] as const;

/**
 * 校验 AI 渠道表 + 能力路由（fail-fast，随 validateEnv 一起跑）。
 *
 * 渠道名由用户自定（AI_CHANNEL_<名字>__字段），是动态前缀，无法用固定 key 的
 * zod schema 覆盖，故单独在此对原始 env 做交叉校验：
 * 1. 至少 1 个渠道，每个渠道协议合法、密钥非空（忘配密钥启动即失败）；
 * 2. 三条能力路由齐全，各含 channel/model；
 * 3. 路由引用的 channel 必须存在于渠道表（核心防呆）。
 *
 * @param raw process.env 原始对象
 * @returns 错误信息数组（空数组表示通过）
 */
function validateAiConfig(raw: Record<string, unknown>): string[] {
  const errors: string[] = [];

  // ── 聚合渠道表 ──
  const channelReg = /^AI_CHANNEL_(.+?)__(PROTOCOL|BASE_URL|API_KEY)$/;
  const channels: Record<
    string,
    { protocol?: string; apiKey?: string }
  > = {};
  for (const [key, value] of Object.entries(raw)) {
    const m = channelReg.exec(key);
    if (!m) continue;
    const name = m[1].toLowerCase();
    const ch = (channels[name] ??= {});
    if (m[2] === 'PROTOCOL') ch.protocol = String(value ?? '');
    else if (m[2] === 'API_KEY') ch.apiKey = String(value ?? '');
  }

  const channelNames = Object.keys(channels);
  if (channelNames.length === 0) {
    errors.push('AI 渠道表为空：至少配置一个 AI_CHANNEL_<名字>__PROTOCOL/API_KEY');
  }
  for (const [name, ch] of Object.entries(channels)) {
    if (!ch.protocol || !AI_PROTOCOLS.includes(ch.protocol as never)) {
      errors.push(
        `AI_CHANNEL_${name.toUpperCase()}__PROTOCOL 非法：需为 anthropic | openai，当前「${ch.protocol ?? ''}」`,
      );
    }
    if (!ch.apiKey) {
      errors.push(`AI_CHANNEL_${name.toUpperCase()}__API_KEY 不能为空`);
    }
  }

  // ── 校验能力路由 ──
  for (const ability of AI_ABILITIES) {
    const channel = String(raw[`AI_ROUTE_${ability}__CHANNEL`] ?? '')
      .trim()
      .toLowerCase();
    const model = String(raw[`AI_ROUTE_${ability}__MODEL`] ?? '').trim();
    if (!channel) {
      errors.push(`AI_ROUTE_${ability}__CHANNEL 不能为空`);
    } else if (!channelNames.includes(channel)) {
      errors.push(
        `AI_ROUTE_${ability}__CHANNEL 引用了不存在的渠道「${channel}」，可用渠道：${channelNames.join(', ') || '（无）'}`,
      );
    }
    if (!model) {
      errors.push(`AI_ROUTE_${ability}__MODEL 不能为空`);
    }
  }

  return errors;
}

/**
 * 供 @nestjs/config 的 validate 钩子调用。
 * @param raw process.env 原始对象
 * @returns 校验并转换后的配置；任一字段非法则抛错，进程启动失败
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  const aiErrors = validateAiConfig(raw);
  if (!parsed.success || aiErrors.length > 0) {
    const zodIssues = parsed.success
      ? []
      : parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    const aiIssues = aiErrors.map((e) => `  - ${e}`);
    throw new Error(
      `环境变量校验失败：\n${[...zodIssues, ...aiIssues].join('\n')}`,
    );
  }
  return parsed.data;
}
