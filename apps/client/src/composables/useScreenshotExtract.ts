/**
 * useScreenshotExtract：购物截图提取商品信息 + 兜底。
 *
 * 与 useRecognition 同构但独立：两者的等待文案、失败语义（先存截图稍后补）
 * 不同，且提取输入是多图，参数化合并的复杂度大于这几十行重复。
 * 返回三态而非「结果 | null」：非购物截图要拦下（不弹确认表单），技术故障
 * 仍要放行进确认页手填，两者的用户动作相反，不能混成一个 null。
 */

import { ref } from 'vue';
import {
  RECOGNITION_CONFIDENCE_THRESHOLD,
  type ScreenshotExtractResult,
} from '@zhiyi/shared';
import { extractScreenshot } from '../api/garment.api';

/** 等待超过此时长（毫秒）切换第二阶段文案 */
const SLOW_HINT_DELAY_MS = 12000;

/**
 * 提取结果三态。用可辨识联合而非「结果 + 布尔标记」：
 * 调用方在 kind 上分流时由 TS 强制穷尽，日后加态不会漏处理。
 */
export type ExtractOutcome =
  /** 读到商品信息，进确认页预填 */
  | {
      kind: 'ok';
      result: ScreenshotExtractResult;
      croppedImageUrl: string | null;
    }
  /** 不是购物截图：拦下不弹表单，把 message 展示在入口页 */
  | { kind: 'irrelevant'; message: string }
  /** 技术故障：照旧进确认页走「先存截图稍后补」 */
  | { kind: 'error' };

export function useScreenshotExtract() {
  const extracting = ref(false);
  const lowConfidence = ref(false);
  const extractingHint = ref('AI 正在读取截图…');
  let slowHintTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * 从已上传的购物截图提取商品信息。
   * @param imageUrls 又拍云截图 URL（1~3 张，同一件商品）
   * @returns 三态结果，调用方按 kind 分流（见 ExtractOutcome）
   */
  async function extract(imageUrls: string[]): Promise<ExtractOutcome> {
    extracting.value = true;
    lowConfidence.value = false;
    extractingHint.value = 'AI 正在读取截图…';
    slowHintTimer = setTimeout(() => {
      extractingHint.value = '有点慢，AI 正在换个思路…';
    }, SLOW_HINT_DELAY_MS);
    try {
      const res = await extractScreenshot(imageUrls);
      // 后端失败不抛错，用 extracted + reason 标记：非购物截图要拦，故障要放行
      if (!res.extracted) {
        return res.reason === 'irrelevant'
          ? { kind: 'irrelevant', message: res.message }
          : { kind: 'error' };
      }
      lowConfidence.value =
        res.result.confidence < RECOGNITION_CONFIDENCE_THRESHOLD;
      return {
        kind: 'ok',
        result: res.result,
        croppedImageUrl: res.croppedImageUrl,
      };
    } catch (e) {
      // 网络异常等静默兜底：不弹错误，按故障态让页面走「先存截图稍后补」
      return { kind: 'error' };
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
