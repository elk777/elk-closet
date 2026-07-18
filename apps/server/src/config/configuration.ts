/**
 * 分命名空间的强类型配置工厂。
 *
 * 为什么分命名空间：业务代码按领域取配置（database / redis / ai / upyun / jwt / app），
 * `configService.get<AiConfig>('ai')` 拿到带类型的对象，IDE 有补全、拼错 key 编译期报错，
 * 避免满屏散落的 `process.env.XXX` 字符串魔法值。
 *
 * env 已在 validateEnv 里校验+转换过，这里只做「分组 + 结构化」，不再重复校验。
 */

import { registerAs } from '@nestjs/config';

/** 应用级配置 */
export interface AppConfig {
  env: 'development' | 'production' | 'test';
  port: number;
  apiPrefix: string;
  isProduction: boolean;
}

/** 数据库配置 */
export interface DatabaseConfig {
  url: string;
}

/** Redis 配置 */
export interface RedisConfig {
  host: string;
  port: number;
  password: string;
  db: number;
}

/** JWT 配置 */
export interface JwtConfig {
  secret: string;
  expiresIn: string;
}

/** 单个 AI 协议端点配置 */
export interface AiEndpointConfig {
  baseUrl?: string;
  apiKey: string;
  model: string;
}

/** AI 配置：含当前选用协议与两套端点，换模型只改 env */
export interface AiConfig {
  provider: 'anthropic' | 'openai';
  anthropic: AiEndpointConfig;
  openai: AiEndpointConfig;
  timeoutMs: number;
  /** 视觉能力开关：false 时识别/预猜直接降级，不调必 404 的传图接口 */
  visionEnabled: boolean;
}

/** 又拍云对象存储配置 */
export interface UpyunConfig {
  bucket: string;
  operator: string;
  password: string;
  domain: string;
  uploadDir: string;
  signExpire: number;
}

/**
 * 和风天气配置（今日推荐的天气输入，PRD 4.5）。
 *
 * apiHost 为账号专属域名（和风控制台「设置」页可见），非旧的公共 devapi 域名；
 * defaultLon/defaultLat 为定位失败时的兜底城市经纬度（小程序定位需资质，
 * 开发期或用户拒授权时回退到此，保证推荐链路不中断）。
 */
export interface WeatherConfig {
  apiHost: string;
  apiKey: string;
  defaultLon: number;
  defaultLat: number;
}

export const appConfig = registerAs('app', (): AppConfig => {
  const env = (process.env.NODE_ENV ?? 'development') as AppConfig['env'];
  return {
    env,
    port: Number(process.env.PORT ?? 3000),
    apiPrefix: process.env.API_PREFIX ?? 'api',
    isProduction: env === 'production',
  };
});

export const databaseConfig = registerAs(
  'database',
  (): DatabaseConfig => ({
    url: process.env.DATABASE_URL as string,
  }),
);

export const redisConfig = registerAs(
  'redis',
  (): RedisConfig => ({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD ?? '',
    db: Number(process.env.REDIS_DB ?? 0),
  }),
);

export const jwtConfig = registerAs(
  'jwt',
  (): JwtConfig => ({
    secret: process.env.JWT_SECRET as string,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '30d',
  }),
);

export const aiConfig = registerAs(
  'ai',
  (): AiConfig => ({
    provider: (process.env.AI_PROVIDER ?? 'anthropic') as AiConfig['provider'],
    anthropic: {
      baseUrl: process.env.AI_ANTHROPIC_BASE_URL,
      apiKey: process.env.AI_ANTHROPIC_API_KEY ?? '',
      model: process.env.AI_ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
    },
    openai: {
      baseUrl: process.env.AI_OPENAI_BASE_URL,
      apiKey: process.env.AI_OPENAI_API_KEY ?? '',
      model: process.env.AI_OPENAI_MODEL ?? 'gpt-4o',
    },
    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 30000),
    // 默认关闭：当前 mimo 模型不支持传图，避免每次识别/打卡都空等一次 404
    visionEnabled: process.env.AI_VISION_ENABLED === 'true',
  }),
);

export const upyunConfig = registerAs(
  'upyun',
  (): UpyunConfig => ({
    bucket: process.env.UPYUN_BUCKET as string,
    operator: process.env.UPYUN_OPERATOR as string,
    password: process.env.UPYUN_PASSWORD as string,
    domain: process.env.UPYUN_DOMAIN as string,
    uploadDir: process.env.UPYUN_UPLOAD_DIR ?? 'garments',
    signExpire: Number(process.env.UPYUN_SIGN_EXPIRE ?? 600),
  }),
);

export const weatherConfig = registerAs(
  'weather',
  (): WeatherConfig => ({
    apiHost: process.env.QWEATHER_API_HOST ?? '',
    apiKey: process.env.QWEATHER_API_KEY ?? '',
    // 兜底城市默认杭州（经纬度），定位失败时用它取天气
    defaultLon: Number(process.env.QWEATHER_DEFAULT_LON ?? 120.15),
    defaultLat: Number(process.env.QWEATHER_DEFAULT_LAT ?? 30.28),
  }),
);

/** 汇总所有 config 工厂，供 ConfigModule.forRoot 的 load 使用 */
export const configFactories = [
  appConfig,
  databaseConfig,
  redisConfig,
  jwtConfig,
  aiConfig,
  upyunConfig,
  weatherConfig,
];
