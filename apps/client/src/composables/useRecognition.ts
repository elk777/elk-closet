/**
 * useRecognition：AI 识别衣物属性 + 兜底。
 *
 * 识别失败不阻塞录入（PRD 5.6 生命线）——返回 null，页面据此走「先存图后补」。
 * 低置信度时标记 lowConfidence，确认页可高亮提示用户核对。
 */

import { ref } from 'vue';
import {
  RECOGNITION_CONFIDENCE_THRESHOLD,
  type RecognitionResult,
} from '@zhiyi/shared';
import { recognizeGarment } from '../api/garment.api';

export function useRecognition() {
  const recognizing = ref(false);
  const lowConfidence = ref(false);

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
      recognizing.value = false;
    }
  }

  return {
    recognizing,
    recognize,
    lowConfidence,
  };
}
