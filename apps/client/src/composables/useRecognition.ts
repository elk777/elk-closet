/**
 * useRecognition：AI 识别衣物属性 + 兜底。
 *
 * 识别失败不阻塞录入（PRD 5.6 生命线）——返回 null，页面据此走「先存图后补」。
 * 低置信度时标记 lowConfidence，确认页可高亮提示用户核对。
 * 识别可能较慢（后端主模型失败会自动切兜底模型，最长可达 1 分钟），
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

export function useRecognition() {
  const recognizing = ref(false);
  const lowConfidence = ref(false);
  const recognizingHint = ref('AI 识别中…');
  let slowHintTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * 识别一张已上传的衣物图。
   * @param imageUrl 又拍云图 URL
   * @returns 识别结果；失败返回 null（走先存图后补）
   */
  async function recognize(
    imageUrl: string,
  ): Promise<RecognitionResult | null> {
    recognizing.value = true;
    lowConfidence.value = false;
    recognizingHint.value = 'AI 识别中…';
    slowHintTimer = setTimeout(() => {
      recognizingHint.value = '有点慢，AI 正在换个思路…';
    }, SLOW_HINT_DELAY_MS);
    try {
      const res = await recognizeGarment(imageUrl);
      // 后端识别失败不抛错，用 recognized 标记：false 时走「先存图后补」
      if (!res.recognized) return null;
      const result = res.result;
      lowConfidence.value =
        result.confidence < RECOGNITION_CONFIDENCE_THRESHOLD;
      return result;
    } catch (e) {
      // 网络异常等静默兜底：不弹错误，返回 null 让页面走「先存图后补」
      return null;
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
