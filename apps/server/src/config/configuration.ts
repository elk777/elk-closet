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

/** AI 协议种类：决定底层用哪个 SDK（anthropic → @anthropic-ai/sdk，openai → openai） */
export type AiProtocol = 'anthropic' | 'openai';

/**
 * 单个命名渠道：一套 client 连接参数。
 *
 * 渠道只描述「连到哪、用什么协议、拿什么密钥」，不含 model——
 * model 由能力路由按需指定，同一渠道可被不同能力用不同模型调用。
 */
export interface AiChannelConfig {
  protocol: AiProtocol;
  baseUrl?: string;
  apiKey: string;
}

/**
 * 单个能力的路由：指向哪个渠道、用哪个模型、是否需要 vision。
 *
 * vision 挂在路由上而非全局：识别/预猜要传图（vision=true），推荐纯文本（false）；
 * 由 AiService 据此决定「无 vision 能力时直接降级」，不下沉到 Provider。
 */
export interface AiRouteConfig {
  /** 渠道名（小写，须命中 channels 的 key） */
  channel: string;
  model: string;
  vision: boolean;
}

/** 可路由的 AI 能力名（tryon 预留，本次不实现能力本体） */
export type AiAbility = 'recognize' | 'recommend' | 'guess';

/**
 * AI 总配置：渠道表 + 能力路由 + 全局超时。
 *
 * 换模型只改对应能力路由的一行 env；加渠道只加一条渠道 env，均无需改代码。
 */
export interface AiConfig {
  /** 命名渠道表，key = 渠道名（小写） */
  channels: Record<string, AiChannelConfig>;
  /** 能力 → 路由映射 */
  routes: Record<AiAbility, AiRouteConfig>;
  timeoutMs: number;
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

/**
 * 解析 AI 配置：渠道表 + 能力路由均为动态前缀，遍历 process.env 聚合。
 *
 * 为什么遍历而非逐 key 读：渠道名由用户自定义（AI_CHANNEL_<名字>__字段），
 * 编译期不知道有哪些渠道，只能扫描环境变量按前缀归组。
 * 本工厂只做「结构化」，不校验；合法性（协议枚举、密钥非空、路由引用的渠道
 * 是否存在）由 validateEnv → validateAiConfig 在启动阶段 fail-fast。
 */
export const aiConfig = registerAs('ai', (): AiConfig => {
  const channels: Record<string, AiChannelConfig> = {};
  // 渠道字段名 → AiChannelConfig 属性名
  const channelReg = /^AI_CHANNEL_(.+?)__(PROTOCOL|BASE_URL|API_KEY)$/;
  const routeReg = /^AI_ROUTE_(RECOGNIZE|RECOMMEND|GUESS)__(CHANNEL|MODEL|VISION)$/;

  const routes: Record<AiAbility, AiRouteConfig> = {
    recognize: { channel: '', model: '', vision: false },
    recommend: { channel: '', model: '', vision: false },
    guess: { channel: '', model: '', vision: false },
  };

  for (const [key, rawValue] of Object.entries(process.env)) {
    const value = rawValue ?? '';

    const chMatch = channelReg.exec(key);
    if (chMatch) {
      const name = chMatch[1].toLowerCase();
      const field = chMatch[2];
      const ch = (channels[name] ??= {
        protocol: 'anthropic',
        apiKey: '',
      });
      if (field === 'PROTOCOL') ch.protocol = value as AiProtocol;
      else if (field === 'BASE_URL') ch.baseUrl = value || undefined;
      else if (field === 'API_KEY') ch.apiKey = value;
      continue;
    }

    const rtMatch = routeReg.exec(key);
    if (rtMatch) {
      const ability = rtMatch[1].toLowerCase() as AiAbility;
      const field = rtMatch[2];
      const rt = routes[ability];
      if (field === 'CHANNEL') rt.channel = value.toLowerCase();
      else if (field === 'MODEL') rt.model = value;
      else if (field === 'VISION') rt.vision = value === 'true';
    }
  }

  return {
    channels,
    routes,
    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 30000),
  };
});

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
