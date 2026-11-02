/**
 * 发送邮箱验证码的入参。
 */

import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';

export class SendCodeDto {
  /**
   * 收件邮箱。
   * normalize 成小写并去空白：`Foo@Bar.com` 与 `foo@bar.com` 是同一个邮箱，
   * 若原样入库会出现「同一邮箱两个账号」，也让 Redis 限流 key 失配。
   */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: '邮箱格式不正确' })
  email!: string;
}