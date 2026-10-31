/**
 * user store：登录态与当前用户。
 *
 * 登录方式按平台分流：
 * - 小程序端：uni.login() 拿 code → 后端 jscode2session 换 openid → 建号发 token（静默，用户无感）
 * - H5 / 开发：后端 dev-login 直接建测试账号（生产环境该接口被禁用）
 *
 * 对外接口（ensureLogin / user / logout）两端一致，页面不感知差异。
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { User } from '@zhiyi/shared';
import { devLogin, fetchMe, wxLogin, type LoginResult } from '../api/auth.api';
import { getToken, setToken, clearToken } from '../utils/auth-storage';

export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null);
  const token = ref<string | null>(getToken());

  /**
   * 执行一次登录并落 token / 用户。
   *
   * 小程序端走真静默登录；H5 端没有微信环境，走 dev-login。
   * 用条件编译而非运行时判断：H5 构建产物里不带 wxLogin，避免打包多余的
   * 微信分支；反之小程序产物里也没有 devLogin 调用。
   */
  async function login(): Promise<void> {
    let res: LoginResult;
    // #ifdef MP-WEIXIN
    const code = await getWxLoginCode();
    res = await wxLogin(code);
    // #endif
    // #ifndef MP-WEIXIN
    res = await devLogin();
    // #endif
    token.value = res.token;
    setToken(res.token);
    user.value = res.user;
  }

  /**
   * 确保已登录：无 token 则登录；有 token 但没用户信息则拉取；
   * token 失效（过期 / 伪造 / 用户被删）则清掉重登一次。
   *
   * 「失效后自动重登」是必要的：JWT 有效期 30 天，过期后前端只剩一个坏
   * token，若不重登用户会被卡在「登录失败」提示里出不来。
   * 幂等，可在 App 启动与进入需要登录的页面时重复调用。
   */
  async function ensureLogin(): Promise<void> {
    if (!token.value) {
      await login();
      return;
    }
    if (user.value) return;

    try {
      user.value = await fetchMe();
    } catch {
      // token 不可用：清掉再走一次完整登录，失败则向上抛给调用方提示
      clearToken();
      token.value = null;
      await login();
    }
  }

  /** 登出：清 token 与用户，回到未登录态 */
  function logout() {
    clearToken();
    token.value = null;
    user.value = null;
  }

  return { user, token, ensureLogin, logout };
});

/**
 * 调 uni.login 取临时凭证。
 *
 * 包成 Promise 并统一处理 fail：不同基础库版本对 Promise 化支持不一，
 * 显式走回调最稳。
 * @returns 临时登录凭证 code
 */
function getWxLoginCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.login({
      provider: 'weixin',
      success: (res) => {
        if (res.code) resolve(res.code);
        else reject(new Error('微信登录未返回 code'));
      },
      fail: (err) => reject(new Error(err.errMsg || '微信登录失败')),
    });
  });
}