/**
 * EmailCodeService：邮箱验证码的签发、校验与限流。
 *
 * 数据全部放 Redis——验证码与计数是典型的「短命 + TTL + 原子计数」数据，
 * 正是 Redis 的适用场景。业务缓存（衣橱/推荐/天气）不走这里，理由见 RedisService。
 *
 * 安全设计要点：
 * - 验证码用 crypto.randomInt，不用 Math.random（后者可预测）
 * - 邮箱维度 60 秒一码，IP 维度每小时 10 次，两道闸门防邮件轰炸
 * - 错码累计 5 次即作废，防止 6 位码被暴力穷举（100 万分之一的空间，
 *   5 次尝试的命中率是 0.0005%，实际不可行）
 * - 校验成功即删除（一次性消费），失败也保留剩余次数
 * - 发码成功与否对外文案一致，避免通过响应差异枚举已注册邮箱
 */

import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'crypto';
import { RedisService } from '../redis/redis.service';
import { MailService, MailSendError } from './mail.service';

/** 验证码有效期（秒） */
const CODE_TTL_SECONDS = 10 * 60;

/** 同一邮箱发码冷却（秒） */
const EMAIL_COOLDOWN_SECONDS = 60;

/** 同一 IP 每小时的**不同邮箱**上限。
 *
 * 不按「总发码次数」计：同一网络下可能有多个真实用户（家里、公司、
 * 咖啡馆共用出口 IP），按总量计会让他们互相挤占额度。
 * 改为只统计不同邮箱数——同一人反复给自己发码由 EMAIL_COOLDOWN 兜住，
 * 而轰炸不同邮箱才是 IP 维度真正要防的行为。
 */
const IP_HOURLY_EMAIL_LIMIT = 20;

/** IP 限流窗口（秒） */
const IP_WINDOW_SECONDS = 60 * 60;

/** 单个验证码允许的最大错误次数，达到即作废 */
const MAX_VERIFY_ATTEMPTS = 5;

/** Redis key 前缀，集中定义避免散落拼接出错 */
const KEY = {
  code: (email: string) => `email_code:${email}`,
  fail: (email: string) => `email_code_fail:${email}`,
  rateEmail: (email: string) => `rate:email:${email}`,
  /** IP 已发过的邮箱集合（Set），用于按「不同邮箱数」计数 */
  rateIpEmails: (ip: string) => `rate:ip_emails:${ip}`,
} as const;

@Injectable()
export class EmailCodeService {
  private readonly logger = new Logger(EmailCodeService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly mail: MailService,
  ) {}

  /**
   * 发送验证码。
   *
   * 顺序有讲究：**先占限流位，再发信**。
   * 反过来的话，发信成功后若限流写入失败，用户可无限刷；而先占位再发信，
   * 最坏情况是「占了位但信没发出去」。因此后续任一步失败都必须把**邮箱冷却位**
   * 回滚掉，否则用户没收到码却要被罚等 60 秒，再点时直接 429。
   * @param email 收件邮箱（DTO 已校验格式并统一为小写）
   * @param ip 请求来源 IP，用于 IP 维度限流
   * @throws HttpException 429 触发限流；503 邮件服务未启用；500 发信失败
   */
  async sendCode(email: string, ip: string): Promise<void> {
    // 未配置邮件服务：直接告知，不做无意义的限流占位
    if (!this.mail.isConfigured()) {
      throw new HttpException(
        '邮箱登录暂未启用，请使用其他方式登录',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // ── 限流：EMAIL 冷却 ──
    // setNx 返回 false 说明冷却期内已发过，直接拒绝，不报具体剩余秒数
    // （暴露剩余时间对正常用户无价值，对爆破者是有用信息）
    const emailGate = await this.redis.setNx(
      KEY.rateEmail(email),
      '1',
      EMAIL_COOLDOWN_SECONDS,
    );
    if (!emailGate) {
      throw new HttpException(
        '发送太频繁了，请稍后再试',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 冷却位已占，之后任何一步失败都要把它还回去。
    // 用 sent 标记而不是在每个 catch 里各删一次：漏一条分支就会出现
    // 「没收到码却要等 60 秒」的现象，收敛成一处不容易再漏。
    let sent = false;
    try {
      // ── 限流：IP 维度（按不同邮箱数）──
      // 放在 email 冷却之后：同一邮箱的重复发送已在上一步被拦掉，
      // 走不到这里的统计，集合不会被同一邮箱刷大
      const ipEmailCount = await this.redis.addToSetWithTtl(
        KEY.rateIpEmails(ip),
        email,
        IP_WINDOW_SECONDS,
      );
      if (ipEmailCount > IP_HOURLY_EMAIL_LIMIT) {
        throw new HttpException(
          '当前网络发送次数过多，请稍后再试',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // ── 生成并存储验证码 ──
      // randomInt 走 CSPRNG，padStart 保证「000123」这类也不丢前导零
      const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      await this.redis.setex(KEY.code(email), code, CODE_TTL_SECONDS);

      // ── 发信 ──
      await this.mail.sendVerificationCode(email, code);
      sent = true;
      this.logger.log('验证码邮件已发送');
    } catch (err) {
      // 验证码要删：否则残留的码会在 10 分钟内占住一次校验机会。
      // 回滚失败不能盖掉原始错误，否则用户看到的提示会变成 Redis 故障。
      await this.redis.del(KEY.code(email)).catch(() => undefined);
      // HttpException 原样抛出：IP 超额是 429，重包装成 500 会让前端
      // 显示「服务异常」而不是「发送次数过多」，也丢掉了限流语义。
      if (err instanceof HttpException) throw err;
      throw err instanceof MailSendError
        ? new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR)
        : new HttpException(
            '验证码发送失败，请稍后重试',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
    } finally {
      // 没发出去就把 60 秒冷却还回去，用户可立即重试。
      // IP 集合不回滚：它按不同邮箱去重，本次计入也只占 1 格；
      // 而删掉已在集合里的历史邮箱会让额度被低估。
      if (!sent) {
        await this.redis.del(KEY.rateEmail(email)).catch(() => undefined);
      }
    }
  }

  /**
   * 校验验证码，成功即消费。
   *
   * 消费语义（校验通过就删除）保证一次一用：用户拿到码后反复点登录也只生效一次。
   * 失败则累加计数，达到上限时连同验证码一起删除——此时用户必须重新发码，
   * 无法在同一个码上继续穷举。
   * @param email 收件邮箱
   * @param code 用户输入的 6 位码
   * @throws BadRequestException 验证码错误 / 已过期 / 尝试次数超限
   */
  async verifyCode(email: string, code: string): Promise<void> {
    const stored = await this.redis.get(KEY.code(email));

    // 不存在有两种可能：从未发过，或已过期（Redis TTL 到期）。对外统一为「已过期」
    if (!stored) {
      throw new BadRequestException('验证码已过期，请重新获取');
    }

    if (stored !== code) {
      const attempts = await this.redis.incrWithTtl(
        KEY.fail(email),
        CODE_TTL_SECONDS,
      );
      // 达到上限：作废验证码与计数，用户必须重新发码才能继续
      if (attempts >= MAX_VERIFY_ATTEMPTS) {
        await this.redis.del(KEY.code(email));
        await this.redis.del(KEY.fail(email));
        this.logger.warn(`验证码错误次数达上限，已作废`);
        throw new BadRequestException('验证码错误次数过多，请重新获取');
      }
      // 不透露剩余次数，避免攻击者据此判断还需尝试几次
      throw new BadRequestException('验证码不正确');
    }

    // 校验通过：消费验证码，清掉失败计数，避免影响下次发码
    await this.redis.del(KEY.code(email));
    await this.redis.del(KEY.fail(email));
  }

  /**
   * 该邮箱是否已有待验证的验证码。
   * 仅用于测试与运维排查，业务链路不依赖。
   * @param email 邮箱
   */
  async hasPendingCode(email: string): Promise<boolean> {
    return (await this.redis.get(KEY.code(email))) !== null;
  }
}
