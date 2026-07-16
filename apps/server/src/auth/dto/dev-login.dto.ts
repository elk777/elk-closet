/**
 * 开发登录入参：可选指定测试身份，模拟多用户场景。
 */

import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DevLoginDto {
  /** 可选测试身份标识；缺省用固定测试用户 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  openid?: string;
}
