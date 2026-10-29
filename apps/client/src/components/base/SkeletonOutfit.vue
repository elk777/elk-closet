<script setup lang="ts">
/**
 * SkeletonOutfit：推荐卡片骨架屏。
 *
 * 为什么不用 AppLoading 的转圈：转圈只表达「在等」，加载完成时整块区域会从
 * 一行字的高度突然撑成两张卡片，产生明显跳版。骨架屏提前占住内容将要出现的位置，
 * 感知更快、切换更平滑。
 *
 * 结构严格复刻 index.vue 的真实套装卡（head / items / reason / adopt 四层），
 * 尺寸取自同一套 px 值——改卡片样式时这里要同步，否则会出现跳版。
 */
interface Props {
  /** 骨架卡片数量，与推荐默认套数一致 */
  count?: number;
}
withDefaults(defineProps<Props>(), { count: 2 });
</script>

<template>
  <view class="sk">
    <view v-for="i in count" :key="i" class="sk-card">
      <!-- head：左侧标签、右侧匹配度 -->
      <view class="sk-card__head">
        <view class="sk-bar sk-bar--tag" />
        <view class="sk-bar sk-bar--score" />
      </view>

      <!-- items：横排三个单品占位，与 piece 同宽 -->
      <view class="sk-card__items">
        <view v-for="j in 3" :key="j" class="sk-piece">
          <view class="sk-block sk-block--img" />
          <view class="sk-bar sk-bar--name" />
        </view>
      </view>

      <!-- reason：两行文字 -->
      <view class="sk-bar sk-bar--reason" />
      <view class="sk-bar sk-bar--reason sk-bar--short" />

      <!-- adopt：按钮 -->
      <view class="sk-block sk-block--adopt" />
    </view>
  </view>
</template>

<style lang="scss" scoped>
.sk {
  display: flex;
  flex-direction: column;
  /* 与真实 .outfits 的 gap 一致（index 16px / match 16px 取同值） */
  gap: 16px;
  /* 与真实 .outfits 的上边距对齐：index 16px、match 20px，取 20px 不会在首页产生下移 */
  margin-top: 20px;
}

.sk-card {
  background: $zy-surface;
  border-radius: $zy-radius;
  padding: 18px;
  box-shadow: $zy-shadow-soft;
}

.sk-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sk-card__items {
  display: flex;
  gap: 12px;
  margin: 14px 0;
}

.sk-piece {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 96px;
  gap: 8px;
}

/* 占位块统一走微光动画：比静态灰块更能说明「正在加载」而非「内容就是空的」 */
.sk-bar,
.sk-block {
  background: linear-gradient(90deg, $zy-bg 25%, rgba(0, 0, 0, 0.06) 37%, $zy-bg 63%);
  background-size: 400% 100%;
  animation: sk-shimmer 1.4s ease infinite;
  border-radius: 4px;
}

.sk-bar--tag { width: 64px; height: 20px; border-radius: 10px; }
.sk-bar--score { width: 56px; height: 17px; }
.sk-bar--name { width: 72px; height: 12px; }
/* 真实 reason 两行 13px / line-height 1.6 ≈ 42px，占位取 2×13px + 间距对齐 */
.sk-bar--reason { width: 100%; height: 13px; margin-top: 8px; }
.sk-bar--short { width: 60%; }

.sk-block--img { width: 96px; height: 96px; border-radius: $zy-radius-sm; }
.sk-block--adopt { width: 100%; height: 44px; margin-top: 14px; border-radius: $zy-radius-sm; }

@keyframes sk-shimmer {
  0% { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}
</style>