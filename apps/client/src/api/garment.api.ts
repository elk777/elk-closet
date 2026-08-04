/**
 * 衣物相关接口。
 */

import type {
  Garment,
  RecognitionResult,
  ScreenshotExtractResult,
} from '@zhiyi/shared';
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
  /** 附加信息（JSONB）：截图导入写 { source:'screenshot', pendingPhoto:true } */
  extra?: Record<string, unknown>;
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

/** 抠图响应：cutoutImageUrl=null 表示抠不出，前端回退原图当主图 */
export interface CutoutResponse {
  cutoutImageUrl: string | null;
}

/**
 * 对拍照/选图的实物图抠图去背景（不入库，供确认页预览 + create 落 cutoutImageUrl）。
 * @param imageUrl 又拍云图 URL
 * @returns 白底图 URL，抠不出为 null
 */
export function cutoutGarment(imageUrl: string) {
  return http.post<CutoutResponse>(
    '/garments/cutout',
    { imageUrl },
    // 抠图后端约 3~4s，首调含模型加载，留足余量
    { timeout: 30000 },
  );
}

/**
 * 截图提取响应：降级哲学与识别一致，用 extracted 标记成败。
 * - extracted=true 时带 result（字段可为 null——读不到不编造）与
 *   croppedImageUrl（服务端按模型 bbox 裁出的商品图；裁不出为 null，回退整张截图）
 * - extracted=false 时仅带 message，前端走「先存截图稍后补」
 */
export type ExtractScreenshotResponse =
  | {
      extracted: true;
      result: ScreenshotExtractResult;
      croppedImageUrl: string | null;
    }
  | { extracted: false; message: string };

/**
 * 从购物截图提取商品信息（不入库，供确认页预填）。
 * @param imageUrls 又拍云截图 URL（1~3 张，同一件商品）
 * @returns 提取响应信封（成败由 extracted 标记）
 */
export function extractScreenshot(imageUrls: string[]) {
  return http.post<ExtractScreenshotResponse>(
    '/garments/extract-screenshot',
    { imageUrls },
    // 主模型失败切兜底(慢模型)+ 服务端裁剪上传,全链路实测可达 2 分半,
    // 全局 60s 会在后端仍在跑时误报失败,与后端 AI_TIMEOUT_MS(180s)对齐
    { timeout: 180000 },
  );
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
