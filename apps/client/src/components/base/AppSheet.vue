<script setup lang="ts">
/**
 * AppSheet：底部上滑弹层（对齐 demo 的 .sheet）。
 *
 * 录入、打卡等交互都用它。受控组件——用 v-model 控制显隐，
 * 遮罩点击关闭，顶部有 grip 拖拽条视觉。
 */
interface Props {
  /** 是否显示（v-model） */
  modelValue: boolean;
  /** 标题 */
  title?: string;
  /** 副标题 */
  subtitle?: string;
}

defineProps<Props>();

const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

/** 关闭弹层（遮罩/关闭按钮触发） */
function close() {
  emit('update:modelValue', false);
}
</script>

<template>
  <view class="sheet-root" :class="{ 'sheet-root--show': modelValue }">
    <!-- 遮罩 -->
    <view class="sheet-mask" @click="close" />
    <!-- 弹层主体 -->
    <view class="sheet" @click.stop>
      <view class="sheet__grip" />
      <view v-if="title" class="sheet__head">
        <text class="sheet__title">{{ title }}</text>
        <text v-if="subtitle" class="sheet__sub">{{ subtitle }}</text>
      </view>
      <view class="sheet__body">
        <slot />
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.sheet-root {
  position: fixed;
  inset: 0;
  z-index: 100;
  pointer-events: none;

  &--show {
    pointer-events: auto;

    .sheet-mask {
      opacity: 1;
    }
    .sheet {
      transform: translateY(0);
    }
  }
}

.sheet-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  opacity: 0;
  transition: opacity 0.25s;
}

.sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  max-height: 85vh;
  background: $zy-bg;
  border-radius: $zy-radius $zy-radius 0 0;
  padding: 0 20px calc(env(safe-area-inset-bottom) + 20px);
  transform: translateY(100%);
  transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
  overflow-y: auto;
}

.sheet__grip {
  width: 40px;
  height: 5px;
  border-radius: 3px;
  background: #d4d1ca;
  margin: 8px auto 14px;
}

.sheet__head {
  margin-bottom: 18px;
}
.sheet__title {
  display: block;
  font-size: 20px;
  font-weight: 700;
  color: $zy-ink;
}
.sheet__sub {
  display: block;
  margin-top: 4px;
  font-size: 13px;
  color: $zy-ink-2;
}
</style>
