/**
 * RedisClient：ioredis 实例的 DI token。
 *
 * 用 token 注入而非直接注入 ioredis 类：连接失败时提供的是 null，
 * 让消费方显式处理「Redis 不可用」这一合法状态，而不是拿到一个
 * 永远 pending 的 client 在调用时才超时。
 */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');