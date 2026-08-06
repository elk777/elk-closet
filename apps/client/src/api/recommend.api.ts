/**
 * 今日推荐接口。
 */

import type { MatchedOutfits, TodayRecommendation } from '@zhiyi/shared';
import { http } from './request';

/** 今日推荐入参：经纬度与场合均可选 */
export interface TodayRecommendPayload {
  /** 经度（前端定位得到，缺省用后端兜底城市） */
  lon?: number;
  /** 纬度 */
  lat?: number;
  /** 场合，如「通勤」；不传按日常 */
  occasion?: string;
  /**
   * 强制重新生成，绕过当日当时段缓存。
   *
   * 「换一套」用：用户要的就是换个结果，命中缓存等于点了没反应。
   */
  forceRefresh?: boolean;
}

/**
 * 获取今日推荐。
 * @param payload 可选经纬度与场合
 * @returns 三态今日推荐（locked / ok / empty）
 */
export function getTodayRecommendation(payload: TodayRecommendPayload = {}) {
  return http.post<TodayRecommendation>(
    '/recommend/today',
    payload as unknown as Record<string, unknown>,
    // 推荐是 AI 生成语义，比普通接口慢（模型推理 + 可能重试），
    // 单独放宽到 90s，避免慢一点就被全局 60s 超时误判为「网络异常」
    { timeout: 90000 },
  );
}

/** 智能搭配入参：场合 / 风格 / 季节，均可选 */
export interface MatchOutfitPayload {
  /** 场合，限 OCCASION_OPTIONS；不传按日常 */
  occasion?: string;
  /** 风格，限 STYLE_OPTIONS；不传不约束 */
  style?: string;
  /** 季节，限 SEASONS；不传后端按当前月份推断 */
  season?: string;
}

/**
 * 获取智能搭配。
 * @param payload 场合 / 风格 / 季节维度
 * @returns 四态搭配结果（locked / thin / ok / empty）
 */
export function getMatchedOutfits(payload: MatchOutfitPayload = {}) {
  return http.post<MatchedOutfits>(
    '/recommend/outfits',
    payload as unknown as Record<string, unknown>,
    // 同今日推荐：AI 生成语义，放宽超时
    { timeout: 90000 },
  );
}
