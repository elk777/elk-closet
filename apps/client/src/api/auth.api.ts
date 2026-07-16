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

/** 拉取当前登录用户 */
export function fetchMe() {
  return http.get<User>('/auth/me');
}
