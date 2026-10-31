/**
 * 用户资料接口（设置页）。
 */

import type { User } from '@zhiyi/shared';
import { http } from './request';

/**
 * 修改衣柜名（trim 后 1~16 字，后端校验）。
 * @param closetName 新衣柜名
 * @returns 更新后的衣柜名（调用方据此合并进 user store，首页立即生效）
 */
export function updateClosetName(closetName: string) {
  return http.post<{ closetName: string }>('/user/closet-name', { closetName });
}

/**
 * 修改个人资料（头像 / 昵称，均可选，只改传入的字段）。
 * @param payload 要更新的字段
 * @returns 更新后的完整用户，调用方据此整体替换 store.user
 */
export function updateProfile(payload: {
  nickname?: string;
  avatarUrl?: string;
}) {
  return http.post<User>('/user/profile', payload);
}
