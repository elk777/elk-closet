/**
 * useRecognition：AI 识别衣物属性 + 兜底。
 *
 * 返回三态而非「结果 | null」：图中没有衣物要拦下（不进确认表单、不入橱），
 * 技术故障仍要放行进表单手填，两者的用户动作相反，不能混成一个 null。
 * 低置信度时标记 lowConfidence，确认页可高亮提示用户核对。
 * 识别可能较慢（后端主模型失败会自动切兜底模型，单次识别请求因此放宽到 180s），
 * recognizingHint 提供分阶段等待文案缓解长等待焦虑。
 */

import { ref } from 'vue';
import {
  RECOGNITION_CONFIDENCE_THRESHOLD,
  type RecognitionResult,
} from '@zhiyi/shared';
import { recognizeGarment } from '../api/garment.api';

/** 等待超过此时长（毫秒）切换第二阶段文案 */
const SLOW_HINT_DELAY_MS = 12000;

/**
 * 识别结果三态。用可辨识联合而非「结果 + 布尔标记」：
 * 调用方在 kind 上分流时由 TS 强制穷尽，漏处理一支就是一条录入路径的缺口。
 */
export type RecognizeOutcome =
  /** 识别到衣物，进确认页预填 */
  | { kind: 'ok'; result: RecognitionResult }
  /** 图中没有衣物：拦下不进表单，把 message 展示给用户 */
  | { kind: 'not-garment'; message: string }
  /** 技术故障：照旧进确认页走「先存图后补」 */
  | { kind: 'error' };

export function useRecognition() {
  const recognizing = ref(false);
  const lowConfidence = ref(false);
  const recognizingHint = ref('AI 识别中…');
  let slowHintTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * 识别一张已上传的衣物图。
   * @param imageUrl 又拍云图 URL
   * @returns 三态结果，调用方按 kind 分流（见 RecognizeOutcome）
   */
  async function recognize(imageUrl: string): Promise<RecognizeOutcome> {
    recognizing.value = true;
    lowConfidence.value = false;
    recognizingHint.value = 'AI 识别中…';
    slowHintTimer = setTimeout(() => {
      recognizingHint.value = '有点慢，AI 正在换个思路…';
    }, SLOW_HINT_DELAY_MS);
    try {
      const res = await recognizeGarment(imageUrl);
      // 后端不抛错，用 recognized + reason 标记：非衣物要拦，技术故障要放行
      if (!res.recognized) {
        return res.reason === 'irrelevant'
          ? { kind: 'not-garment', message: res.message }
          : { kind: 'error' };
      }
      lowConfidence.value =
        res.result.confidence < RECOGNITION_CONFIDENCE_THRESHOLD;
      return { kind: 'ok', result: res.result };
    } catch (e) {
      // 网络异常等静默兜底：不弹错误，按故障态让页面走「先存图后补」
      return { kind: 'error' };
    } finally {
      if (slowHintTimer) {
        clearTimeout(slowHintTimer);
        slowHintTimer = null;
      }
      recognizing.value = false;
    }
  }

  return {
    recognizing,
    recognizingHint,
    recognize,
    lowConfidence,
  };
}
