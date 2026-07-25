/**
 * AI 试穿接口（PRD 4.6）。
 *
 * 两步：先确保有全身照（saveBodyPhoto 只传一次、复用）→ tryOnOutfit 合成整套上身。
 * 试穿是图像生成，慢且低频，单独放宽超时。
 */

import type { TryOnResponse } from '@zhiyi/shared';
import { http } from './request';

/** 试穿一套入参：单品 id 清单 + 可选场合/风格 */
export interface TryOnOutfitPayload {
  /** 本套单品 id（须属于当前用户） */
  itemIds: string[];
  /** 场合软约束，可选 */
  occasion?: string;
  /** 风格软约束，可选 */
  style?: string;
}

/**
 * 试穿一套：把指定单品合成到用户全身照上。
 * @param payload 单品 id 清单 + 可选场合/风格
 * @returns 三态试穿结果（no_body / ok / failed）
 */
export function tryOnOutfit(payload: TryOnOutfitPayload) {
  return http.post<TryOnResponse>(
    '/tryon/outfit',
    payload as unknown as Record<string, unknown>,
    // 图像生成比文本更慢，放宽到 120s，避免慢一点就被误判为网络异常
    { timeout: 120000 },
  );
}

/**
 * 保存/更新当前用户的全身照 URL（前端直传 body 目录后回传）。
 * @param bodyPhotoUrl 全身照可访问 URL
 * @returns 已保存的全身照 URL
 */
export function saveBodyPhoto(bodyPhotoUrl: string) {
  return http.post<{ bodyPhotoUrl: string }>('/tryon/body-photo', {
    bodyPhotoUrl,
  });
}
