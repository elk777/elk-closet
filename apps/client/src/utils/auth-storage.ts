/**
 * 登录令牌本地存取。
 *
 * 小程序用 uni.setStorageSync 持久化 token，重启后仍在。
 * token 是登录态唯一凭证，请求器与 user store 都只经此读写，不散落各处。
 */

const TOKEN_KEY = 'zhiyi_token';

/** 读取 token，未登录返回 null */
export function getToken(): string | null {
  try {
    return uni.getStorageSync(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

/** 写入 token */
export function setToken(token: string): void {
  uni.setStorageSync(TOKEN_KEY, token);
}

/** 清除 token（登出 / 401） */
export function clearToken(): void {
  uni.removeStorageSync(TOKEN_KEY);
}
