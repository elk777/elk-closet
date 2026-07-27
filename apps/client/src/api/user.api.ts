/**
 * 用户资料接口（设置页）。
 */

import { http } from './request';

/**
 * 修改衣柜名（trim 后 1~16 字，后端校验）。
 * @param closetName 新衣柜名
 * @returns 更新后的衣柜名（调用方据此合并进 user store，首页立即生效）
 */
export function updateClosetName(closetName: string) {
  return http.post<{ closetName: string }>('/user/closet-name', { closetName });
}
