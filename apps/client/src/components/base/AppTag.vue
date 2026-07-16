<script setup lang="ts">
/**
 * AppTag：胶囊标签（品类/风格/季节等）。
 *
 * 对齐 demo 的 .tag：浅底次要文字为默认，dark 变体为墨黑底白字（强调）。
 */
interface Props {
  /** 变体：default 浅底 / dark 墨黑底 */
  variant?: 'default' | 'dark';
}
withDefaults(defineProps<Props>(), {
  variant: 'default',
});
</script>

<template>
  <text class="tag" :class="`tag--${variant}`">
    <slot />
  </text>
</template>

<style lang="scss" scoped>
.tag {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: $zy-radius-pill;
}

.tag--default {
  background: #f0efeb;
  color: $zy-ink-2;
}

.tag--dark {
  background: $zy-accent;
  color: #fff;
}
</style>
