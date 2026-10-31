/**
 * user store：登录态与当前用户。
 *
 * **登录是用户主动行为，且是「按需触发」而非启动即要求**：
 * 小程序审核要求用户能先浏览产品，涉及个人数据的操作才引导授权（同商城
 * 「加购物车才登录」）。因此：
 * - App 启动不登录、不跳转，首页可直接打开
 * - 读接口在未登录时静默失败，页面走空状态引导
 * - 写操作入口调 requireLogin()，未登录才提示并去登录页
 *
 * 登录方式按平台分流：
 * - 小程序端：uni.login() 拿 code → 后端 jscode2session 换 openid → 建号发 token
 * - H5 / 开发：后端 dev-login 直接建测试账号（生产环境该接口被禁用）
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { User } from '@zhiyi/shared';
import { devLogin, fetchMe, wxLogin, type LoginResult } from '../api/auth.api';
import { getToken, setToken, clearToken } from '../utils/auth-storage';

/** 登录页路径：需要授权时的出口 */
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
   * 校验登录态，**不跳转、不建号**。
   *
   * 供读接口使用：未登录时返回 false，调用方据此展示空状态/游客引导，
   * 而不是把用户拦在门外。有 token 但拉不到用户时清掉（token 已失效）。
   * @returns 是否处于有效登录态
   */
  async function ensureLogin(): Promise<boolean> {
    if (!token.value) return false;
    if (user.value) return true;
    try {
      user.value = await fetchMe();
      return true;
    } catch {
      // token 过期 / 伪造 / 用户被删：清掉，但不跳转（用户可能只是在浏览）
      clearToken();
      token.value = null;
      return false;
    }
  }

  /**
   * 需要登录的操作前调用：已登录直接放行，否则提示并跳登录页。
   *
   * 与 ensureLogin 的分工：ensureLogin 是「查一下」（浏览用，静默），
   * requireLogin 是「必须登录」（写操作用，会打断并跳转）。
   * @param hint 提示文案，说明为什么要登录（如「登录后才能保存衣物」）
   * @returns 是否已登录；false 表示已引导用户去登录页，调用方应中止操作
   */
  async function requireLogin(hint = '登录后才能使用该功能'): Promise<boolean> {
    if (await ensureLogin()) return true;
    uni.showModal({
      title: '需要登录',
      content: hint,
      confirmText: '去登录',
      cancelText: '先看看',
      success: (res) => {
        if (res.confirm) uni.navigateTo({ url: LOGIN_PAGE });
      },
    });
    return false;
  }

  /** 登出：清 token 与用户，回登录页 */
  function logout() {
    clearToken();
    token.value = null;
    user.value = null;
    uni.reLaunch({ url: LOGIN_PAGE });
  }

  return { user, token, isLoggedIn, login, ensureLogin, requireLogin, logout };
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