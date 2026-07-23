/**
 * 衣物相关接口。
 */

import type { Garment, RecognitionResult } from '@zhiyi/shared';
import { http } from './request';

/** 创建衣物入参：图必填，属性可缺省（先存图后补） */
export interface CreateGarmentPayload {
  originalImageUrl: string;
  cutoutImageUrl?: string;
  name?: string;
  category?: string;
  majorType?: string;
  mainColor?: string;
  colorHex?: string;
  material?: string;
  thickness?: string;
  seasons?: string[];
  formality?: string;
  styleTags?: string[];
  brand?: string;
  price?: number;
}

/**
 * 识别接口响应：后端不抛 500，用 recognized 标记成败。
 * - recognized=true 时带 result（完整识别属性）
 * - recognized=false 时仅带 message，前端走「先存图后补」
 */
export type RecognizeResponse =
  | { recognized: true; result: RecognitionResult }
  | { recognized: false; message: string };

/**
 * AI 识别衣物属性（不入库）。
 * @param imageUrl 又拍云图 URL
 * @returns 识别响应信封（成败由 recognized 标记，见 RecognizeResponse）
 */
export function recognizeGarment(imageUrl: string) {
  return http.post<RecognizeResponse>('/garments/recognize', { imageUrl });
}

/** 创建衣物 */
export function createGarment(payload: CreateGarmentPayload) {
  return http.post<Garment>(
    '/garments',
    payload as unknown as Record<string, unknown>,
  );
}

/** 衣物列表 */
export function listGarments() {
  return http.get<Garment[]>('/garments');
}

/** 衣物详情 */
export function detailGarment(id: string) {
  return http.get<Garment>(`/garments/${id}`);
}

/** 记一次穿着：穿着次数 +1，上次穿着日期置为今天（PRD 4.7 数据飞轮起点） */
export function recordWear(id: string) {
  return http.post<Garment>(`/garments/${id}/wear`);
}

/** 标记 / 取消闲置（进出断舍离清单，PRD 4.8） */
export function setArchived(id: string, archived: boolean) {
  return http.post<Garment>(`/garments/${id}/archive`, { archived });
}
