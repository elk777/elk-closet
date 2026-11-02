/**
 * RedisService：验证码与限流所用的 Redis 访问层。
 *
 * **用途严格限定**：email 验证码、发码限流、错码计数。
 * 衣橱 / 推荐 / 天气的业务缓存一律不走这里——它们要么有索引支撑（ms 级查询），
 * 要么已落表并带业务语义（Recommendation 的 stale / garmentIds），
 * 搬进 Redis 只会引入失效一致性风险而不带来可感知收益。
 *
 * **可用性设计：Redis 挂了不等于服务挂了。**
 * Redis 承载的全是「短命、可重建」的数据，它不可用只应让「邮箱登录」这一条
 * 路径降级，不该拖垮小程序登录、衣橱、推荐。故本服务：
 * - 连接失败只记日志，不抛出，进程照常启动
 * - 任何操作在未连接时抛 ServiceUnavailableException，由业务层转成
 *   用户可见的「邮箱登录暂不可用」
 * 这与「AI 失败不阻塞录入生命线」是同一套降级思路。
 */

import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  ServiceUnavailableException,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/** 业务代码无需关心 Redis 返回值细节，只暴露这几个原语 */
@Injectable()
export class RedisService implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis | null) {}

  /**
   * Redis 是否可用。
   * 供业务层在调用前判断，避免用 try/catch 探测可用性（那会污染异常语义）。
   * @returns 已建连且状态为 ready 时为 true
   */
  get available(): boolean {
    return this.client !== null && this.client.status === 'ready';
  }

  /**
   * 取字符串值。
   * @param key Redis key
   * @returns key 不存在时返回 null
   * @throws ServiceUnavailableException Redis 不可用
   */
  async get(key: string): Promise<string | null> {
    return this.assertClient().get(key);
  }

  /**
   * 写入并设置过期时间（原子操作，避免 SET 后 EXPIRE 前进程崩溃留下永久 key）。
   * @param key Redis key
   * @param value 值
   * @param ttlSeconds 过期秒数
   * @throws ServiceUnavailableException Redis 不可用
   */
  async setex(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.assertClient().setex(key, ttlSeconds, value);
  }

  /**
   * 仅在 key 不存在时写入并设过期时间（限流用的原子判重）。
   * @param key Redis key
   * @param value 值
   * @param ttlSeconds 过期秒数
   * @returns true 表示本次写入成功（即首次）；false 表示 key 已存在
   * @throws ServiceUnavailableException Redis 不可用
   */
  async setNx(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const res = await this.assertClient().set(
      key,
      value,
      'EX',
      ttlSeconds,
      'NX',
    );
    return res === 'OK';
  }

  /**
   * 原子自增，并在首次创建时设置过期时间。
   *
   * 为什么不用 INCR + EXPIRE 两条命令：两者之间若进程崩溃，计数 key
   * 会永久存在，该邮箱/该 IP 从此被永久限流。MULTI 包住或这里用
   * 「首次创建才 EXPIRE」的写法都能规避——这里选后者，判断依据是
   * 自增结果为 1（说明本次刚创建）。
   * @param key Redis key
   * @param ttlSeconds 首次创建时的过期秒数
   * @returns 自增后的计数
   * @throws ServiceUnavailableException Redis 不可用
   */
  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const client = this.assertClient();
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, ttlSeconds);
    }
    return count;
  }

  /**
   * 删除 key（用于验证码一次性消费、错码达标后作废）。
   * @param key Redis key
   * @throws ServiceUnavailableException Redis 不可用
   */
  async del(key: string): Promise<void> {
    await this.assertClient().del(key);
  }

  /**
   * 把成员加入集合，并在集合首次创建时设置过期时间。
   *
   * 用于「按不同邮箱数」做 IP 限流：集合天然去重，同一邮箱重复发送
   * 不会推高计数，只有换了新邮箱才算一次。
   * @param key 集合 key
   * @param member 成员（这里是邮箱）
   * @param ttlSeconds 首次创建时的过期秒数
   * @returns 加入后的集合大小
   * @throws ServiceUnavailableException Redis 不可用
   */
  async addToSetWithTtl(
    key: string,
    member: string,
    ttlSeconds: number,
  ): Promise<number> {
    const client = this.assertClient();
    const size = await client.sadd(key, member);
    // sadd 只返回「新增了几个」，需用 scard 拿当前总数；
    // 首次创建（本次确实新增）时才设过期，避免每次调用都把窗口往后推
    if (size === 1) {
      const total = await client.scard(key);
      if (total === 1) {
        await client.expire(key, ttlSeconds);
      }
      return total;
    }
    return client.scard(key);
  }

  /** 进程关闭时断开连接，避免连接泄漏导致重启卡住 */
  onApplicationShutdown(): void {
    if (this.client) {
      // quit 是优雅关闭；失败（连接已断）时底层会自行销毁，无需处理
      this.client.quit().catch(() => undefined);
    }
  }

  /**
   * 取已建连的 client，未连接则抛出明确异常。
   * @returns ioredis 实例
   * @throws ServiceUnavailableException 未连接
   */
  private assertClient(): Redis {
    if (!this.available) {
      throw new ServiceUnavailableException('邮箱登录暂不可用，请稍后再试');
    }
    return this.client!;
  }
}