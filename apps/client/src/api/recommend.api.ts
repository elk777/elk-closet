/**
 * 今日推荐接口。
 */

import type { MatchedOutfits, TodayRecommendation } from '@zhiyi/shared';
import { http, type RequestOptions } from './request';
import { getCoords } from '../composables/useLocation';

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
 *
 * 同键请求自动合并：小程序冷启动时首页 load() 与登录后预热会同时发出，
 * 合并后只真正打一次接口（服务端缓存按时段命中，两次结果本就一致）。
 * @param payload 可选经纬度与场合，会原样作为请求体发给后端
 * @param opts.silent 静默失败（不弹提示）。用于「登录后预热」这类调用：
 *   预热只是提前填缓存，失败时用户可能还没进首页，弹提示纯属打扰。
 *   只接收 silent——预热不该改写推荐接口的超时等既有约定。
 *   注意它属于请求选项、不会进请求体：后端 DTO 开了 whitelist，多传未知字段会被拒。
 * @returns 三态今日推荐（locked / ok / empty）
 */
export function getTodayRecommendation(
  payload: TodayRecommendPayload = {},
  opts: Pick<RequestOptions, 'silent'> = {},
): Promise<TodayRecommendation> {
  const key = todayRequestKey(payload);
  if (inflightToday?.key === key) return inflightToday.promise;

  const promise = http
    .post<TodayRecommendation>(
      '/recommend/today',
      payload as unknown as Record<string, unknown>,
      // 推荐是 AI 生成语义，比普通接口慢（模型推理 + 可能重试），
      // 单独放宽到 90s，避免慢一点就被全局 60s 超时误判为「网络异常」
      { timeout: 90000, ...opts },
    )
    // 无论成功失败都要清表：失败若留下残留 promise，后续调用会拿到同一个已 reject
    // 的结果而永远无法重试
    .finally(() => {
      if (inflightToday?.promise === promise) inflightToday = null;
    });

  inflightToday = { key, promise };
  return promise;
}

/** 今日推荐请求去重用的 in-flight 表（键见 todayRequestKey） */
let inflightToday: { key: string; promise: Promise<TodayRecommendation> } | null = null;

/**
 * 今日推荐请求的去重键：只由「会改变服务端缓存键」的字段构成。
 *
 * 服务端缓存按 (ownerId, date, timeslot) 命中，与经纬度无关——经纬度只影响天气，
 * 而天气差异由 isCacheValid 事后判定。因此同一时段内两次请求视为等价，可合并。
 * @param payload 今日推荐入参
 * @returns 去重键
 */
function todayRequestKey(payload: TodayRecommendPayload): string {
  return `${payload.forceRefresh ? 'force' : 'cache'}|${payload.occasion ?? ''}`;
}

/**
 * 静默预热今日推荐（登录后调用）。
 *
 * 与首页 getTodayRecommendation 共用同一 in-flight 请求：首页就是启动页，
 * 冷启动时 onShow 的 load() 与预热同时发出，若不合并会**并发两次 AI 生成**——
 * 白白多烧一份配额，且并发更容易撞上游 429，预热反而更慢。
 *
 * 定位失败按兜底城市处理，与首页 load() 同口径。
 * 全程静默：预热只是提前填缓存，失败时用户可能还没进首页，弹提示纯属打扰。
 */
export async function prewarmTodayRecommendation(): Promise<void> {
  try {
    const coords = await getCoords();
    await getTodayRecommendation(
      { lon: coords?.lon, lat: coords?.lat },
      { silent: true },
    );
  } catch {
    // 预热是可选的加速路径：失败静默放弃，等用户进首页时正常生成
  }
}

/** 智能搭配入参：场合 / 风格 / 季节，均可选 */
export interface MatchOutfitPayload {
  /** 场合，限 OCCASION_OPTIONS；不传按日常 */
  occasion?: string;
  /** 风格，限 STYLE_OPTIONS；不传不约束 */
  style?: string;
  /** 季节，限 SEASONS；不传后端按当前月份推断 */
  season?: string;
  /**
   * 强制重新生成，绕过当日缓存。
   *
   * 「换一批」用：同维度重复请求会命中缓存，不传此字段按钮等于没反应。
   */
  forceRefresh?: boolean;
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
