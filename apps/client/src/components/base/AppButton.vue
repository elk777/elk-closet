<script setup lang="ts">
/**
 * AppButton：基础按钮。
 *
 * 对齐 demo 的克制视觉——主按钮墨黑填充、次按钮描边、幽灵按钮无边框。
 * 不引第三方组件库，风格 100% 由设计 token 控制。
 */
import { computed } from 'vue';

interface Props {
  /** 视觉类型：primary 墨黑填充 / secondary 描边 / ghost 无边框 */
  type?: 'primary' | 'secondary' | 'ghost';
  /** 尺寸 */
  size?: 'normal' | 'large';
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否加载中（显示 loading 文案、禁止点击） */
  loading?: boolean;
  /** 是否块级（撑满宽度） */
  block?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  type: 'primary',
  size: 'normal',
  disabled: false,
  loading: false,
  block: false,
});

const emit = defineEmits<{ (e: 'click'): void }>();

/** 禁用或加载时拦截点击 */
function onClick() {
  if (props.disabled || props.loading) return;
  emit('click');
}

const classes = computed(() => [
  'app-btn',
  `app-btn--${props.type}`,
  `app-btn--${props.size}`,
  { 'app-btn--block': props.block, 'app-btn--disabled': props.disabled || props.loading },
]);
</script>

<template>
  <button :class="classes" @click="onClick">
    <text v-if="loading">处理中…</text>
    <slot v-else />
  </button>
</template>

<style lang="scss" scoped>
.app-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: $zy-radius-sm;
  font-weight: 600;
  line-height: 1;
  transition: opacity 0.15s, background 0.15s;

  &::after {
    // 去掉小程序 button 默认边框
    border: none;
  }

  &--normal {
    height: 44px;
    padding: 0 20px;
    font-size: 15px;
  }
  &--large {
    height: 50px;
    padding: 0 24px;
    font-size: 16px;
  }

  &--primary {
    background: $zy-accent;
    color: #fff;
  }
  &--secondary {
    background: $zy-surface;
    color: $zy-ink;
    border: 1px solid $zy-line;
  }
  &--ghost {
    background: transparent;
    color: $zy-ink-2;
  }

  &--block {
    display: flex;
    width: 100%;
  }

  &--disabled {
    opacity: 0.5;
  }
}
</style>
