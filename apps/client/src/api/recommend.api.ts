/**
 * 今日推荐接口。
 */

import type { TodayRecommendation } from '@zhiyi/shared';
import { http } from './request';

/** 今日推荐入参：经纬度与场合均可选 */
export interface TodayRecommendPayload {
  /** 经度（前端定位得到，缺省用后端兜底城市） */
  lon?: number;
  /** 纬度 */
  lat?: number;
  /** 场合，如「通勤」；不传按日常 */
  occasion?: string;
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
