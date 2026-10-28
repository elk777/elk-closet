/**
 * AuthService：登录与签发 JWT。
 *
 * 两个入口：
 * - devLogin：开发/联调用，无需微信环境，固定或指定测试用户直接拿 token
 * - wxMiniLogin：微信小程序静默登录（PRD 4.9），当前留桩，待前端联调补 code 换 openid
 *
 * devLogin 走 UserService.findOrCreate + issueToken；wxMiniLogin 目前是桩（见下），
 * 接入 jscode2session 后同样落到 findOrCreate，保证两条登录路径一致。
 */

import { Injectable, NotImplementedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '../prisma/client';
import { UserService } from '../user/user.service';
import type { JwtPayload } from './jwt-payload.interface';

/** 开发登录用的固定测试身份，保证多次登录拿到同一账号 */
const DEV_OPENID = 'dev-openid-local';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * 开发登录：无需微信环境，直接建/取一个本地测试用户并发 token。
   * @param openid 可选，指定测试身份以模拟多用户；缺省用固定 DEV_OPENID
   * @returns token 与用户
   */
  async devLogin(openid?: string) {
    const user = await this.users.findOrCreate({
      wxMiniOpenid: openid ?? DEV_OPENID,
    });
    return this.buildAuthResult(user);
  }

  /**
   * 微信小程序静默登录（PRD 4.9）：code → openid → 建号发 JWT。
   *
   * 留桩原因：换 openid 需真实 appid/secret 且只能在小程序环境拿 code，
   * 待前端接入时补上对微信 jscode2session 的调用即可，落点仍是 findOrCreate。
   * @param _code wx.login 拿到的临时登录凭证
   */
  async wxMiniLogin(_code: string): Promise<never> {
    throw new NotImplementedException(
      '微信静默登录待前端联调时接入 jscode2session（需配置 appid/secret）',
    );
  }

  /** 用用户主键签发 JWT（secret / 有效期已在 JwtModule 注册时配好） */
  private buildAuthResult(user: User) {
    const payload: JwtPayload = { sub: user.id };
    const token = this.jwt.sign(payload);
    return { token, user };
  }
}
