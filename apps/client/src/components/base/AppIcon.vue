<script setup lang="ts">
/**
 * AppIcon：线条图标组件（PRD 顶栏图标工具栏）。
 *
 * 为什么用 SVG data-URI 而非内联 <svg>：微信小程序不支持内联 <svg> 标签，
 * 也无法通过 <image> 引用 .svg 文件路径。折中方案是把 SVG 源码 URL 编码成
 * data:image/svg+xml,... 塞进 <image src>，各端一致渲染。
 *
 * 图标线条复刻 docs/demo.html 顶栏工具栏的观感（统一 stroke-width、圆角端点）。
 * 颜色不能用 currentColor（data-URI 内脱离文档、拿不到继承色），故把 stroke
 * 直接写进每次生成的 SVG，由 color prop 驱动。
 */
import { computed } from 'vue';

/** 支持的图标名：对齐顶栏工具栏与页面返回/搜索所需 */
type IconName =
  | 'closet' // 我的衣橱（田字格）
  | 'diary' // 穿搭日记（带日期的本子）
  | 'match' // 智能搭配（星形）
  | 'board' // 衣橱看板（柱状图）
  | 'settings' // 设置（齿轮）——预留，本期顶栏暂不展示
  | 'search' // 搜索（放大镜）
  | 'plus' // 添加（加号）——悬浮添加按钮
  | 'back'; // 返回（左箭头）

interface Props {
  /** 图标名 */
  name: IconName;
  /** 尺寸（rpx），宽高一致 */
  size?: number;
  /** 描边色，默认墨黑 */
  color?: string;
}
const props = withDefaults(defineProps<Props>(), {
  size: 44,
  color: '#2f2b26',
});

/**
 * 各图标的 SVG path 定义（viewBox 统一 0 0 24 24，纯描边）。
 * 与 demo.html 顶栏工具栏一致，保证线条风格统一。
 */
const PATHS: Record<IconName, string> = {
  closet: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M10 4v16"/>',
  diary:
    '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 9h16M9 3v4M15 3v4"/><circle cx="12" cy="14.5" r="2.2"/>',
  match: '<path d="M12 3l2.2 5.6L20 10l-4.5 3.8L17 20l-5-3-5 3 1.5-6.2L4 10l5.8-1.4z"/>',
  board: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  settings:
    '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.5M12 18.5V21M4.2 7l2.1 1.2M17.7 15.8l2.1 1.2M4.2 17l2.1-1.2M17.7 8.2l2.1-1.2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
};

/** 生成 data-URI：拼出完整 SVG 再 encodeURIComponent（# 等字符必须转义，否则小程序解析失败） */
const src = computed(() => {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ` +
    `stroke="${props.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `${PATHS[props.name]}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
});

/** 尺寸样式：宽高同 size（rpx） */
const sizeStyle = computed(() => ({
  width: `${props.size}rpx`,
  height: `${props.size}rpx`,
}));
</script>

<template>
  <image class="icon" :src="src" :style="sizeStyle" mode="aspectFit" />
</template>

<style lang="scss" scoped>
.icon {
  display: block;
}
</style>
