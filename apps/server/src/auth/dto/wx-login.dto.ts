/**
 * 微信小程序登录入参：wx.login 拿到的临时 code。
 */

import { IsNotEmpty, IsString } from 'class-validator';

export class WxLoginDto {
  /** wx.login 返回的临时登录凭证，5 分钟有效 */
  @IsString()
  @IsNotEmpty()
  code!: string;
}
