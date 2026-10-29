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
 * 等待超过此时长（毫秒）才允许「跳过 AI」。
 *
 * 比 SLOW_HINT_DELAY_MS 晚 3 秒：先让用户看到「正在换个思路」的反馈，
 * 再给出口。用户过早放弃会白等一次（后台请求仍会跑完）。
 * 两个常量语义不同，不要合并。
 */
const SKIP_ENABLE_DELAY_MS = 15000;

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
  /** 等待够久、可以显示「跳过 AI」按钮 */
  const canSkip = ref(false);
  /** 本次是用户主动跳过的（用于区别于「AI 没认出来」的文案） */
  const skipped = ref(false);
  let slowHintTimer: ReturnType<typeof setTimeout> | null = null;
  let skipTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * 用户已点跳过：请求返回后据它丢弃结果。
   *
   * 为什么需要闸门：`uni.request` 的 Promise 无法中途取消，用户点跳过只是
   * 「不再等」，底层请求仍会跑完。若不丢弃，迟到的结果会覆盖用户正在填的表单。
   */
  let skipRequested = false;

  /** 清掉两个等待计时器（正常返回与跳过路径都要清，防定时器继续改 UI） */
  function clearTimers() {
    if (slowHintTimer) {
      clearTimeout(slowHintTimer);
      slowHintTimer = null;
    }
    if (skipTimer) {
      clearTimeout(skipTimer);
      skipTimer = null;
    }
  }

  /**
   * 识别一张已上传的衣物图。
   * @param imageUrl 又拍云图 URL
   * @returns 三态结果，调用方按 kind 分流（见 RecognizeOutcome）
   */
  async function recognize(imageUrl: string): Promise<RecognizeOutcome> {
    recognizing.value = true;
    lowConfidence.value = false;
    recognizingHint.value = 'AI 识别中…';
    canSkip.value = false;
    skipped.value = false;
    skipRequested = false;
    slowHintTimer = setTimeout(() => {
      recognizingHint.value = '有点慢，AI 正在换个思路…';
    }, SLOW_HINT_DELAY_MS);
    skipTimer = setTimeout(() => {
      canSkip.value = true;
    }, SKIP_ENABLE_DELAY_MS);
    try {
      const res = await recognizeGarment(imageUrl);
      // 用户已跳过：结果直接丢弃，不碰任何状态（否则会覆盖用户正在填的表单）
      if (skipRequested) return { kind: 'error' };
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
      clearTimers();
      recognizing.value = false;
    }
  }

  /**
   * 跳过等待：立即放行 UI，让调用方走「先存图后补」。
   *
   * 返回 error 态而非新增 kind：调用方对 error 的处理正是「进确认表单 + 提示可稍后补」，
   * 与跳过的期望一致。新增一支只会让穷尽分支多做同样的事。
   */
  function skip(): RecognizeOutcome {
    skipRequested = true;
    skipped.value = true;
    canSkip.value = false;
    recognizing.value = false;
    clearTimers();
    return { kind: 'error' };
  }

  return {
    recognizing,
    recognizingHint,
    recognize,
    lowConfidence,
    canSkip,
    skipped,
    skip,
  };
}
