/**
 * user store：登录态与当前用户。
 *
 * 登录是**用户主动行为**，不是静默建号——小程序审核要求用户知情地授权，
 * 因此首次进入由登录页上的「微信登录」按钮触发（见 pages/login/login.vue）。
 * 登录方式按平台分流：
 * - 小程序端：uni.login() 拿 code → 后端 jscode2session 换 openid → 建号发 token
 * - H5 / 开发：后端 dev-login 直接建测试账号（生产环境该接口被禁用）
 *
 * 对外接口（login / ensureLogin / user / logout）两端一致，页面不感知差异。
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { User } from '@zhiyi/shared';
import { devLogin, fetchMe, wxLogin, type LoginResult } from '../api/auth.api';
import { getToken, setToken, clearToken } from '../utils/auth-storage';

/** 登录页路径：未登录时的唯一出口 */
export const LOGIN_PAGE = '/pages/login/login';

export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null);
  const token = ref<string | null>(getToken());

  /** 是否已登录（有 token 即视为有登录态，真实有效性由 ensureLogin 校验） */
  const isLoggedIn = () => Boolean(token.value);

  /**
   * 执行一次登录并落 token / 用户。**只在用户主动点击登录按钮时调用。**
   *
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
   * 确保已登录：已就绪直接返回；否则**跳转登录页**，不静默建号。
   *
   * 与改造前的区别：以前无 token 会直接调 devLogin/uni.login 建号，用户全程
   * 无感——但那恰恰是审核不通过的原因（用户没有主动授权动作）。
   * 现在改为拦截跳转，由用户在登录页点击按钮授权。
   *
   * 幂等：可在每个需要登录的页面 onShow 里重复调用。
   * @returns 已登录返回 true；跳转登录页后返回 false，调用方应中止本次加载
   */
  async function ensureLogin(): Promise<boolean> {
    if (token.value) {
      // 有 token 但没用户信息（冷启动 / 换页），补拉一次
      if (!user.value) {
        try {
          user.value = await fetchMe();
        } catch {
          // token 失效（过期 / 伪造 / 用户被删）：清掉并回到登录页
          clearToken();
          token.value = null;
          redirectToLogin();
          return false;
        }
      }
      return true;
    }
    redirectToLogin();
    return false;
  }

  /** 跳登录页；已在登录页则不重复跳（避免登录页调用 ensureLogin 时自我循环） */
  function redirectToLogin() {
    const pages = getCurrentPages();
    const current = pages[pages.length - 1]?.route ?? '';
    if (current === LOGIN_PAGE.replace(/^\//, '')) return;
    uni.reLaunch({ url: LOGIN_PAGE });
  }

  /** 登出：清 token 与用户，回登录页 */
  function logout() {
    clearToken();
    token.value = null;
    user.value = null;
    uni.reLaunch({ url: LOGIN_PAGE });
  }

  return { user, token, isLoggedIn, login, ensureLogin, logout };
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