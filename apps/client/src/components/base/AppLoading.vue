<script setup lang="ts">
/**
 * AppLoading：加载态（旋转圈 + 可选文字）。
 *
 * 录入时 AI 识别、上传等异步等待用它，对齐 PRD「不黑屏干等，给进度反馈」。
 */
interface Props {
  /** 加载提示文字 */
  text?: string;
}
defineProps<Props>();
</script>

<template>
  <view class="loading">
    <view class="loading__spinner" />
    <text v-if="text" class="loading__text">{{ text }}</text>
  </view>
</template>

<style lang="scss" scoped>
.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  gap: 12px;
}

.loading__spinner {
  width: 28px;
  height: 28px;
  border: 3px solid $zy-line;
  border-top-color: $zy-accent;
  border-radius: 50%;
  animation: loading-spin 0.8s linear infinite;
}

.loading__text {
  font-size: 13px;
  color: $zy-ink-2;
}

@keyframes loading-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
