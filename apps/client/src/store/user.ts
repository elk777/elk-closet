/**
 * user store：登录态与当前用户（A 方案）。
 *
 * A 方案：启动时用后端 dev-login 静默拿 token 存本地，快速打通录入链路；
 * 微信真静默登录（wx.login + jscode2session）后续替换 ensureLogin 内部实现即可，
 * 对外接口不变（页面只调 ensureLogin / 读 user）。
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { User } from '@zhiyi/shared';
import { devLogin, fetchMe } from '../api/auth.api';
import { getToken, setToken, clearToken } from '../utils/auth-storage';

export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null);
  const token = ref<string | null>(getToken());

  /**
   * 确保已登录：无 token 则走 dev-login 建号拿 token；有 token 但没用户信息则拉取。
   * 幂等，可在 App 启动与进入需要登录的页面时重复调用。
   */
  async function ensureLogin() {
    if (!token.value) {
      const res = await devLogin();
      token.value = res.token;
      setToken(res.token);
      user.value = res.user;
      return;
    }
    if (!user.value) {
      user.value = await fetchMe();
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
