/**
 * 穿搭日记接口（PRD 4.7）。
 *
 * 打卡两步：先 guess 预猜穿了哪几件（可跳过）→ 用户确认 → create 保存并反哺穿着数。
 * 回看：按月列出（月历）、查单条详情。
 */

import type { OutfitView } from '@zhiyi/shared';
import { http } from './request';

/** 创建打卡入参：图必填，itemIds/wornOn/occasion/note 均可选 */
export interface CreateOutfitPayload {
  /** 打卡美照 URL（前端直传对象存储后回传） */
  photoUrl: string;
  /** 用到的衣物 id 列表；可空（只存美照也是合法打卡） */
  itemIds?: string[];
  /** 穿着日期（YYYY-MM-DD）；缺省为服务端当天 */
  wornOn?: string;
  /** 场合，如「通勤」；可选 */
  occasion?: string;
  /** 来源：ai 推荐采纳 / manual 自主 / tryon 试穿；缺省 manual */
  source?: 'ai' | 'manual' | 'tryon';
  /** 随手备注；可选 */
  note?: string;
}

/**
 * 预猜打卡照里穿了衣橱哪几件（尽力而为）。
 * 后端猜不出返回空数组，前端降级为「无预选，用户手动选」，不报错。
 * @param photoUrl 打卡美照 URL
 * @returns 命中的衣物 id 列表
 */
export function guessOutfit(photoUrl: string) {
  return http.post<{ itemIds: string[] }>('/outfits/guess', { photoUrl });
}

/**
 * 保存打卡：建记录 + 反哺穿着数。
 * @param payload 打卡入参
 * @returns 打卡记录富视图（已展开单品）
 */
export function createOutfit(payload: CreateOutfitPayload) {
  return http.post<OutfitView>(
    '/outfits',
    payload as unknown as Record<string, unknown>,
  );
}

/**
 * 按月列出打卡记录（月历回看）。
 * @param year 年，如 2026
 * @param month 月，1~12
 * @returns 该月打卡记录富视图列表（按穿着日倒序）
 */
export function listOutfitsByMonth(year: number, month: number) {
  return http.get<OutfitView[]>(`/outfits?year=${year}&month=${month}`);
}

/**
 * 查单条打卡详情。
 * @param id 打卡记录 id
 * @returns 打卡记录富视图
 */
export function detailOutfit(id: string) {
  return http.get<OutfitView>(`/outfits/${id}`);
}
