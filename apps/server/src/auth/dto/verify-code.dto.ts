/**
 * 邮箱验证码校验的入参。
 */

import { Transform } from 'class-transformer';
import { IsEmail, Matches } from 'class-validator';

export class VerifyCodeDto {
  /** 收件邮箱，与 SendCodeDto 同一归一化规则 */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: '邮箱格式不正确' })
  email!: string;

  /** 6 位数字验证码；先于业务比对做格式校验，避免无意义的 Redis 往返 */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^\d{6}$/, { message: '验证码为 6 位数字' })
  code!: string;
}