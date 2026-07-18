<template>
  <view class="detail">
    <!-- 加载中 -->
    <view v-if="loading" class="state">
      <AppLoading text="加载中…" />
    </view>

    <!-- 加载失败 / 不存在 -->
    <view v-else-if="!outfit" class="state empty">
      <text class="empty-t">这条打卡不存在或已删除</text>
      <AppButton type="secondary" @click="goBack">返回日记</AppButton>
    </view>

    <template v-else>
      <!-- 美照 -->
      <image class="photo" :src="outfit.photoUrl" mode="widthFix" />

      <!-- 日期 + 场合 + 来源 -->
      <view class="meta">
        <text class="meta__date">{{ wornText }}</text>
        <view class="meta__tags">
          <AppTag v-if="outfit.occasion">{{ outfit.occasion }}</AppTag>
          <AppTag v-if="sourceText" variant="dark">{{ sourceText }}</AppTag>
        </view>
      </view>

      <!-- 天气快照：打卡当天体感，回看时还原 -->
      <view v-if="outfit.weather" class="weather">
        <text class="weather__temp">{{ Math.round(outfit.weather.temp) }}°</text>
        <view class="weather__meta">
          <text class="weather__desc">{{ outfit.weather.desc }}</text>
          <text class="weather__feels">体感 {{ Math.round(outfit.weather.feels) }}°</text>
        </view>
      </view>

      <!-- 备注 -->
      <view v-if="outfit.note" class="note">
        <text class="note__text">{{ outfit.note }}</text>
      </view>

      <!-- 关联单品 -->
      <view class="items">
        <text class="items__title">这套用了 {{ outfit.items.length }} 件</text>
        <view v-if="outfit.items.length === 0" class="items__empty">
          <text>这次只留了张美照，没关联单品</text>
        </view>
        <view v-else class="grid">
          <view
            v-for="item in outfit.items"
            :key="item.id"
            class="piece"
            @click="goGarment(item.id)"
          >
            <image
              class="piece__img"
              :src="item.cutoutImageUrl || item.originalImageUrl"
              mode="aspectFill"
            />
            <text class="piece__name">{{ item.name }}</text>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import type { OutfitView } from '@zhiyi/shared';
import AppLoading from '../../components/base/AppLoading.vue';
import AppButton from '../../components/base/AppButton.vue';
import AppTag from '../../components/base/AppTag.vue';
import { detailOutfit } from '../../api/outfit.api';
import { useUserStore } from '../../store/user';

const outfit = ref<OutfitView | null>(null);
const loading = ref(true);
const userStore = useUserStore();

let outfitId = '';

/** 穿着日期展示：YYYY 年 M 月 D 日 */
const wornText = computed(() => {
  if (!outfit.value) return '';
  const d = new Date(outfit.value.wornOn);
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
});

/** 来源中文（manual 自主搭配不额外标注，ai/tryon 才显示来处） */
const sourceText = computed(() => {
  switch (outfit.value?.source) {
    case 'ai':
      return '采纳推荐';
    case 'tryon':
      return '试穿转化';
    default:
      return '';
  }
});

/**
 * 加载打卡详情。
 * 失败提示已由请求器统一处理，这里只兜底停 loading。
 */
async function load() {
  loading.value = true;
  try {
    await userStore.ensureLogin();
    outfit.value = await detailOutfit(outfitId);
  } catch {
    // 提示已由 request / ensureLogin 统一处理
  } finally {
    loading.value = false;
  }
}

onLoad((query) => {
  outfitId = (query?.id as string) || '';
  if (outfitId) load();
  else loading.value = false;
});

/** 跳衣物详情 */
function goGarment(id: string) {
  uni.navigateTo({ url: `/pages/garment/detail?id=${id}` });
}

/** 返回日记 */
function goBack() {
  uni.navigateBack();
}
</script>

<style lang="scss" scoped>
.detail {
  min-height: 100vh;
  background: $zy-bg;
  padding: $zy-gap-lg;
  padding-bottom: 60px;
}
.state {
  padding-top: 120px;
}
.state.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}
.empty-t {
  font-size: 16px;
  color: $zy-ink-2;
}
.photo {
  width: 100%;
  border-radius: $zy-radius;
  background: $zy-surface;
}
.meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 18px;
}
.meta__date {
  font-size: 18px;
  font-weight: 700;
  color: $zy-ink;
}
.meta__tags {
  display: flex;
  gap: 8px;
}
.weather {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 16px;
  padding: 14px 18px;
  background: $zy-surface;
  border-radius: $zy-radius;
  box-shadow: $zy-shadow-soft;
}
.weather__temp {
  font-size: 28px;
  font-weight: 700;
  color: $zy-ink;
}
.weather__meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.weather__desc {
  font-size: 14px;
  color: $zy-ink;
}
.weather__feels {
  font-size: 12px;
  color: $zy-ink-2;
}
.note {
  margin-top: 16px;
  padding: 16px 18px;
  background: $zy-surface;
  border-radius: $zy-radius;
  box-shadow: $zy-shadow-soft;
}
.note__text {
  font-size: 14px;
  color: $zy-ink;
  line-height: 1.7;
}
.items {
  margin-top: 24px;
}
.items__title {
  font-size: 15px;
  font-weight: 600;
  color: $zy-ink;
}
.items__empty {
  margin-top: 12px;
  font-size: 13px;
  color: $zy-ink-2;
}
.grid {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.piece {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.piece__img {
  width: 100%;
  height: 150rpx;
  border-radius: $zy-radius-sm;
  background: $zy-surface;
}
.piece__name {
  margin-top: 6px;
  width: 100%;
  font-size: 12px;
  color: $zy-ink-2;
  text-align: center;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
