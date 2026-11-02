/**
 * RedisModule：全局提供 RedisService。
 *
 * 连接策略：启动时建连，失败不阻断启动。
 * - `lazyConnect: false` + `maxRetriesPerRequest: 1`：连不上快速失败，
 *   不进入无限重试把请求挂死
 * - `enableOfflineQueue: false`：离线期间新命令立即报错，而不是排队等待，
 *   避免 Redis 挂掉时请求全部堆积到恢复那一刻
 * - 监听 error 事件做日志收敛：ioredis 默认在无监听时把错误打印到 stderr，
 *   高频重连会刷屏
 *
 * 生产侧若确实不想用 Redis（例如单机小规模），把 REDIS_ENABLED 置 false，
 * RedisService 会以「不可用」状态工作，只影响邮箱登录。
 */

import { Global, Logger, Module, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { RedisConfig } from '../config/configuration';
import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';

/** 建连失败或握手超时（毫秒）：保持短超时，避免启动被拖慢 */
const CONNECT_TIMEOUT_MS = 3000;

/**
 * 重连退避上限（毫秒）。**不设次数上限**，一直重试。
 *
 * 曾经设「失败 5 次就停止重连」，但那会让 Redis 短暂抖动的后果被放大：
 * 一个重启只需几秒，而放弃重连后即便 Redis 已恢复，邮箱登录也得等整个
 * 后端进程重启才可用。重连本身很便宜（几秒一次），持续重试才符合
 * 「可选依赖」应有的行为——它挂了我们降级，它回来了我们自动恢复。
 */
const MAX_RETRY_DELAY_MS = 5000;

/**
 * 创建 ioredis 实例；任一异常都返回 null 而非抛出。
 *
 * 同步创建 + 异步监听：ioredis 构造是同步的，连接是异步的。
 * 这里不做 await 就绪，让服务正常启动，就绪与否由 RedisService.available
 * 在每次调用时实时判断——这比「启动时必须连上」更适合一个可选依赖。
 * @param config 应用配置
 * @returns ioredis 实例；未启用或构造异常时为 null
 */
function createRedisClient(
  config: ConfigService,
  logger: Logger,
): Redis | null {
  const redis = config.get<RedisConfig>('redis')!;

  // REDIS_PASSWORD 为空串表示无密码，ioredis 需要 undefined 而非 ''
  const client = new Redis({
    host: redis.host,
    port: redis.port,
    password: redis.password || undefined,
    db: redis.db,
    connectTimeout: CONNECT_TIMEOUT_MS,
    // 连不上快速失败，不把请求挂在无限重试里
    maxRetriesPerRequest: 1,
    // 离线时新命令立即拒绝，避免堆积到重连瞬间形成雪崩
    enableOfflineQueue: false,
    retryStrategy: (times) => {
      // 指数退避到 5s 封顶后持续重试，返回 null 才会彻底放弃
      const delay = Math.min(times * 200, MAX_RETRY_DELAY_MS);
      // 只在头几次打印，之后每 30 次（约 2.5 分钟）提示一次，避免长故障期刷屏
      if (times <= 3 || times % 30 === 0) {
        logger.warn(
          `Redis 重连中（第 ${times} 次，${delay}ms 后重试）：邮箱登录暂不可用，其余功能不受影响`,
        );
      }
      return delay;
    },
  });

  // 必须挂 error 监听：ioredis 在无监听时把错误直接打到 stderr，重连期间会刷屏
  client.on('error', (err: Error) => {
    logger.warn(`Redis 连接异常：${err.message}`);
  });
  client.on('ready', () => {
    logger.log(`Redis 已连接：${redis.host}:${redis.port}`);
  });

  return client;
}

const redisClientProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Redis | null => {
    const logger = new Logger('RedisModule');
    try {
      return createRedisClient(config, logger);
    } catch (err) {
      // 构造即失败（如配置值非法）：降级为不可用，不让整个应用起不来
      logger.error(`Redis 初始化失败，邮箱登录不可用：${String(err)}`);
      return null;
    }
  },
};

@Global()
@Module({
  providers: [redisClientProvider, RedisService],
  exports: [RedisService],
})
export class RedisModule {}