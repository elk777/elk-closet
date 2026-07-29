/**
 * useScreenshotExtract：购物截图提取商品信息 + 兜底。
 *
 * 与 useRecognition 同构但独立：两者的等待文案、失败语义（先存截图稍后补）
 * 不同，且提取输入是多图，参数化合并的复杂度大于这几十行重复。
 * 提取失败不阻塞录入——返回 null，页面据此走「先存截图稍后补」。
 */

import { ref } from 'vue';
import {
  RECOGNITION_CONFIDENCE_THRESHOLD,
  type ScreenshotExtractResult,
} from '@zhiyi/shared';
import { extractScreenshot } from '../api/garment.api';

/** 等待超过此时长（毫秒）切换第二阶段文案 */
const SLOW_HINT_DELAY_MS = 12000;

export function useScreenshotExtract() {
  const extracting = ref(false);
  const lowConfidence = ref(false);
  const extractingHint = ref('AI 正在读取截图…');
  let slowHintTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * 从已上传的购物截图提取商品信息。
   * @param imageUrls 又拍云截图 URL（1~3 张，同一件商品）
   * @returns 提取结果（字段可为 null）；失败返回 null（走先存截图稍后补）
   */
  async function extract(
    imageUrls: string[],
  ): Promise<ScreenshotExtractResult | null> {
    extracting.value = true;
    lowConfidence.value = false;
    extractingHint.value = 'AI 正在读取截图…';
    slowHintTimer = setTimeout(() => {
      extractingHint.value = '有点慢，AI 正在换个思路…';
    }, SLOW_HINT_DELAY_MS);
    try {
      const res = await extractScreenshot(imageUrls);
      // 后端提取失败不抛错，用 extracted 标记：false 时走「先存截图稍后补」
      if (!res.extracted) return null;
      lowConfidence.value =
        res.result.confidence < RECOGNITION_CONFIDENCE_THRESHOLD;
      return res.result;
    } catch (e) {
      // 网络异常等静默兜底：不弹错误，返回 null 让页面走「先存截图稍后补」
      return null;
    } finally {
      if (slowHintTimer) {
        clearTimeout(slowHintTimer);
        slowHintTimer = null;
      }
      extracting.value = false;
    }
  }

  return {
    extracting,
    extractingHint,
    extract,
    lowConfidence,
  };
}
