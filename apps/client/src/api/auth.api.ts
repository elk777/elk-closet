/**
 * 认证相关接口。
 */

import type { User } from '@zhiyi/shared';
import { http } from './request';

/** 登录返回：token + 用户 */
export interface LoginResult {
  token: string;
  user: User;
}

/**
 * 开发登录（A 方案）：无需微信环境，直接建/取测试用户拿 token。
 * @param openid 可选，指定测试身份以模拟多用户
 */
export function devLogin(openid?: string) {
  return http.post<LoginResult>('/auth/dev-login', openid ? { openid } : {});
}

/**
 * 微信小程序静默登录：用 uni.login 拿到的 code 换 token。
 *
 * 只在 MP-WEIXIN 下调用；code 只能由小程序运行时产生，且一次性有效、
 * 5 分钟过期，所以必须由前端现取现发，不能缓存。
 * @param code wx.login 返回的临时登录凭证
 */
export function wxLogin(code: string) {
  return http.post<LoginResult>('/auth/wx-login', { code });
}

/** 拉取当前登录用户 */
export function fetchMe() {
  return http.get<User>('/auth/me');
}
