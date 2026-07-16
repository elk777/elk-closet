<script setup lang="ts">
/** GarmentCard：衣物卡片，展示图 + 名称 + 品类标签，点击跳详情。 */
import type { Garment } from '@zhiyi/shared';
import AppTag from '../base/AppTag.vue';

const props = defineProps<{ garment: Garment }>();
const emit = defineEmits<{ (e: 'tap', id: string): void }>();

/** 名称可能为空（先存图后补），兜底占位 */
function displayName(g: Garment): string {
  return g.name?.trim() || '待补充';
}
</script>

<template>
  <view class="card" @click="emit('tap', garment.id)">
    <image class="card__img" :src="garment.cutoutImageUrl || garment.originalImageUrl" mode="aspectFill" />
    <view class="card__body">
      <text class="card__name zy-ellipsis">{{ displayName(garment) }}</text>
      <view class="card__tags">
        <AppTag v-if="garment.category">{{ garment.category }}</AppTag>
        <AppTag v-if="garment.mainColor">{{ garment.mainColor }}</AppTag>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.card { background: $zy-surface; border-radius: $zy-radius-sm; overflow: hidden; box-shadow: $zy-shadow-soft; }
.card__img { width: 100%; height: 220rpx; background: $zy-bg; display: block; }
.card__body { padding: 16rpx; }
.card__name { font-size: 26rpx; font-weight: 600; color: $zy-ink; }
.card__tags { display: flex; gap: 8rpx; margin-top: 8rpx; }
</style>
