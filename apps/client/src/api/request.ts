/**
 * 统一请求器：封装 uni.request。
 *
 * 职责：
 * - 自动带 JWT（Authorization: Bearer）
 * - 解统一信封：成功 {code:0,data,timestamp} 取 data，失败 {code,message,...} 抛错并提示
 * - 401 清登录态
 * - 网络异常统一提示
 *
 * 页面/store 只调 http.get/post，不直接碰 uni.request。
 */

import { isApiSuccess, type ApiResponse } from '@zhiyi/shared';
import { API_BASE_URL, REQUEST_TIMEOUT } from '../config';
import { getToken, clearToken } from '../utils/auth-storage';
import { useToast } from '../composables/useToast';

export interface RequestOptions {
  /** 请求头附加项 */
  header?: Record<string, string>;
  /** 是否静默（不自动弹错误提示），默认 false */
  silent?: boolean;
  /** 单次超时（毫秒），缺省用全局 REQUEST_TIMEOUT。AI 生成类接口可放宽 */
  timeout?: number;
}

interface FullOptions extends RequestOptions {
  // 微信小程序 wx.request 不支持 PATCH，动作型接口统一走 POST
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  data?: Record<string, unknown>;
}

/**
 * 统一请求核心。
 * @param opts 方法/URL/数据/请求头
 * @returns 解包后的业务数据
 */
function request<T>(opts: FullOptions): Promise<T> {
  const { method, url, data, header = {}, silent = false, timeout } = opts;
  const token = getToken();
  return new Promise<T>((resolve, reject) => {
    uni.request({
      url: `${API_BASE_URL}${url}`,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...header,
      },
      timeout: timeout ?? REQUEST_TIMEOUT,
      success: (res) => {
        const body = res.data as ApiResponse<T>;
        // 业务信封解包：成功与否以信封 code===0 为准（isApiSuccess 窄化到 ApiSuccess）。
        // HTTP 状态码只需落在 2xx 成功区间——NestJS 的 POST 默认返回 201，
        // 若只认 200 会把所有 POST 误判为失败。
        const httpOk = res.statusCode >= 200 && res.statusCode < 300;
        if (httpOk && body && isApiSuccess(body)) {
          resolve(body.data);
          return;
        }
        // 401 清登录态
        if (res.statusCode === 401) {
          clearToken();
        }
        // body 可能是 ApiError（有 message）或缺失，先窄化再取 message
        const msg =
          (body && !isApiSuccess(body) ? body.message : '') ||
          `请求失败(${res.statusCode})`;
        if (!silent) useToast().error(msg);
        reject(new Error(msg));
      },
      fail: () => {
        const msg = '网络异常，请稍后重试';
        if (!silent) useToast().error(msg);
        reject(new Error(msg));
      },
    });
  });
}

export const http = {
  get: <T>(url: string, opts?: RequestOptions) =>
    request<T>({ method: 'GET', url, ...opts }),
  post: <T>(url: string, data?: Record<string, unknown>, opts?: RequestOptions) =>
    request<T>({ method: 'POST', url, data, ...opts }),
};
