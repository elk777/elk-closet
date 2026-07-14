/**
 * 用户领域类型：多端统一账号（PRD 4.9 / 5 数据模型）。
 *
 * 关键约束：unionid 是跨端唯一身份，关联同一人的小程序 + App，
 * 一开始就要设计对，后期难改。
 */

/** 用户账号 */
export interface User {
  /** 内部主键，衣物 / 记录都挂在此 */
  id: string;
  /** 跨端唯一身份，关联同一人的小程序 + App（关键，后期难改） */
  unionid: string | null;
  /** 微信小程序端身份 */
  wxMiniOpenid: string | null;
  /** App 端身份 */
  wxAppOpenid: string | null;
  /** 昵称：按需授权后才有，可空 */
  nickname: string | null;
  /** 头像 URL：按需授权后才有，可空 */
  avatarUrl: string | null;
  /** 衣柜名称，默认「我的衣橱」 */
  closetName: string;
  /** 创建时间（ISO 字符串） */
  createdAt: string;
  /** 最后活跃时间（ISO 字符串），用于留存分析 */
  lastActiveAt: string;
}

/** 衣柜名称默认值 */
export const DEFAULT_CLOSET_NAME = '我的衣橱';
