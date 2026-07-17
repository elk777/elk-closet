<template>
  <view class="today">
    <!-- 天气卡：有天气出实况，无天气（未配置/未授权定位）出中性占位 -->
    <view class="weather">
      <view v-if="rec?.weather" class="weather__main">
        <text class="weather__temp">{{ Math.round(rec.weather.temp) }}°</text>
        <view class="weather__meta">
          <text class="weather__desc">{{ rec.weather.desc }}</text>
          <text class="weather__feels">体感 {{ Math.round(rec.weather.feels) }}°</text>
        </view>
      </view>
      <view v-else class="weather__main">
        <text class="weather__temp">—°</text>
        <text class="weather__desc">天气按季节估算</text>
      </view>
      <text v-if="rec?.weather" class="weather__hint">
        已按今日天气为你挑衣
      </text>
      <text v-else class="weather__hint">
        开启定位后可按实时天气推荐
      </text>
    </view>

    <!-- 加载中 -->
    <view v-if="loading" class="state">
      <AppLoading text="正在为你搭配…" />
    </view>

    <!-- 件数不足：解锁引导（PRD 4.9 冷启动钩子） -->
    <view v-else-if="rec?.status === 'locked'" class="unlock">
      <text class="unlock__t">
        再添 {{ rec.unlockThreshold - rec.garmentCount }} 件，解锁今日推荐
      </text>
      <text class="unlock__s">
        衣橱里有 {{ rec.unlockThreshold }} 件以上，我才好帮你搭出一套
      </text>
      <view class="unlock__bar">
        <view class="unlock__bar-fill" :style="{ width: progress + '%' }" />
      </view>
      <view class="unlock__cta" @click="goAddGarment">
        <text>去添加衣物</text>
      </view>
    </view>

    <!-- 有推荐：套装卡列表 -->
    <view v-else-if="rec?.status === 'ok'" class="outfits">
      <view v-for="(o, i) in rec.outfits" :key="i" class="outfit">
        <view class="outfit__head">
          <view class="outfit__tags">
            <AppTag v-if="o.occasion">{{ o.occasion }}</AppTag>
            <AppTag v-if="o.styleTag">{{ o.styleTag }}</AppTag>
          </view>
          <text class="outfit__score">匹配度 {{ o.matchScore }}</text>
        </view>

        <!-- 单品横排：点进详情 -->
        <scroll-view class="outfit__items" scroll-x :show-scrollbar="false">
          <view class="outfit__row">
            <view
              v-for="item in o.items"
              :key="item.id"
              class="piece"
              @click="goDetail(item.id)"
            >
              <image
                class="piece__img"
                :src="item.cutoutImageUrl || item.originalImageUrl"
                mode="aspectFill"
              />
              <text class="piece__name">{{ item.name }}</text>
            </view>
          </view>
        </scroll-view>

        <!-- 推荐理由 -->
        <text class="outfit__reason">{{ o.reason }}</text>
      </view>

      <!-- 换一套 -->
      <view class="refresh" :class="{ 'refresh--busy': loading }" @click="reload">
        <text>{{ loading ? '搭配中…' : '换一套' }}</text>
      </view>
    </view>

    <!-- 件数够但没搭出来：兜底提示 -->
    <view v-else-if="rec?.status === 'empty'" class="empty">
      <text class="empty-t">这会儿没搭出满意的一套</text>
      <text class="empty-s">稍后再试，或去衣橱自己挑挑</text>
      <view class="empty-cta" @click="reload">
        <text>再试一次</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import type { TodayRecommendation } from '@zhiyi/shared';
import AppLoading from '../../components/base/AppLoading.vue';
import AppTag from '../../components/base/AppTag.vue';
import { getTodayRecommendation } from '../../api/recommend.api';
import { getCoords } from '../../composables/useLocation';
import { useUserStore } from '../../store/user';

const rec = ref<TodayRecommendation | null>(null);
const loading = ref(true);
const userStore = useUserStore();

/** 解锁进度百分比（封顶 100），locked 态用 */
const progress = computed(() => {
  if (!rec.value) return 0;
  const { garmentCount, unlockThreshold } = rec.value;
  return Math.min(100, Math.round((garmentCount / unlockThreshold) * 100));
});

/**
 * 拉取今日推荐。
 * 先幂等确保登录，再尝试取定位（失败静默降级，后端用兜底城市）。
 * 失败提示由请求器统一处理，这里只兜底停 loading。
 */
async function load() {
  loading.value = true;
  try {
    await userStore.ensureLogin();
    const coords = await getCoords();
    rec.value = await getTodayRecommendation({
      lon: coords?.lon,
      lat: coords?.lat,
    });
  } catch {
    // 提示已由 request / ensureLogin 统一处理
  } finally {
    loading.value = false;
  }
}

/** 换一套 / 再试一次：重新生成 */
function reload() {
  if (loading.value) return;
  load();
}

// 每次进入刷新（从衣橱添加返回后件数可能变化）
onShow(() => {
  load();
});

/** 返回衣橱去添加（首页有录入入口） */
function goAddGarment() {
  uni.navigateBack();
}

/** 跳衣物详情 */
function goDetail(id: string) {
  uni.navigateTo({ url: `/pages/garment/detail?id=${id}` });
}
</script>

<style lang="scss" scoped>
.today {
  min-height: 100vh;
  background: $zy-bg;
  padding: $zy-gap-lg;
}
.weather {
  background: $zy-accent;
  border-radius: $zy-radius;
  padding: 24px 20px;
  color: #fff;
}
.weather__main {
  display: flex;
  align-items: baseline;
  gap: 14px;
}
.weather__temp {
  font-size: 40px;
  font-weight: 700;
  color: #fff;
}
.weather__meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.weather__desc {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.9);
}
.weather__feels {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}
.weather__hint {
  display: block;
  margin-top: 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}
.state {
  padding-top: 120px;
}
.unlock {
  margin-top: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.unlock__t {
  font-size: 17px;
  font-weight: 700;
  color: $zy-ink;
}
.unlock__s {
  margin-top: 10px;
  font-size: 13px;
  color: $zy-ink-2;
  text-align: center;
}
.unlock__bar {
  width: 200px;
  height: 6px;
  border-radius: 3px;
  background: $zy-line;
  margin: 24px 0;
  overflow: hidden;
}
.unlock__bar-fill {
  height: 100%;
  background: $zy-accent;
  border-radius: 3px;
  transition: width 0.3s;
}
.unlock__cta {
  padding: 14px 28px;
  border-radius: 30px;
  background: $zy-accent;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
}
.outfits {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.outfit {
  background: $zy-surface;
  border-radius: $zy-radius;
  padding: 18px;
  box-shadow: $zy-shadow-soft;
}
.outfit__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.outfit__tags {
  display: flex;
  gap: 8px;
}
.outfit__score {
  font-size: 12px;
  font-weight: 600;
  color: $zy-accent;
}
.outfit__items {
  white-space: nowrap;
  margin: 14px 0;
}
.outfit__row {
  display: inline-flex;
  gap: 12px;
}
.piece {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  width: 96px;
}
.piece__img {
  width: 96px;
  height: 96px;
  border-radius: $zy-radius-sm;
  background: $zy-bg;
}
.piece__name {
  margin-top: 6px;
  width: 96px;
  font-size: 12px;
  color: $zy-ink-2;
  text-align: center;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.outfit__reason {
  display: block;
  margin-top: 4px;
  font-size: 13px;
  color: $zy-ink-2;
  line-height: 1.6;
}
.refresh {
  margin-top: 4px;
  text-align: center;
  padding: 14px;
  border-radius: $zy-radius-sm;
  background: $zy-surface;
  border: 1px solid $zy-line;
  font-size: 15px;
  font-weight: 600;
  color: $zy-ink;
}
.refresh--busy {
  color: $zy-ink-2;
}
.empty {
  margin-top: 60px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.empty-t {
  font-size: 16px;
  font-weight: 600;
  color: $zy-ink;
}
.empty-s {
  margin-top: 8px;
  font-size: 13px;
  color: $zy-ink-2;
}
.empty-cta {
  margin-top: 24px;
  padding: 14px 28px;
  border-radius: 30px;
  background: $zy-accent;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
}
</style>
