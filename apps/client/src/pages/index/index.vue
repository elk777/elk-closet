<template>
  <view class="home">
    <!-- 顶栏：Logo + 衣柜名 + 图标工具栏（衣橱/日记/搭配/看板）。
         custom 导航栏下须自避状态栏（下移）与微信胶囊（右侧留白），避免被刘海/胶囊覆盖 -->
    <view
      class="topbar"
      :style="{
        paddingTop: statusBarHeight + 12 + 'px',
        paddingRight: 20 + menuInset + 'px',
      }"
    >
      <view class="brand">
        <view class="logo">衣</view>
        <text class="name">{{ closetName }}</text>
      </view>
      <view class="tools">
        <view class="tool" @click="goCloset">
          <AppIcon name="closet" :size="40" color="#6b6862" />
        </view>
        <view class="tool" @click="goDiary">
          <AppIcon name="diary" :size="40" color="#6b6862" />
        </view>
        <view class="tool" @click="goMatch">
          <AppIcon name="match" :size="40" color="#6b6862" />
        </view>
        <view class="tool" @click="goBoard">
          <AppIcon name="board" :size="40" color="#6b6862" />
        </view>
      </view>
    </view>

    <!-- 常驻搜索栏：点击进衣橱页搜索（PRD 4.4 全局搜索入口） -->
    <view class="searchwrap">
      <view class="search" @click="goCloset">
        <AppIcon name="search" :size="30" color="#a8a49c" />
        <text class="search__ph">搜关键词、颜色、风格、场合…</text>
      </view>
    </view>

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
      <text v-if="rec?.weather" class="weather__hint">已按今日天气为你挑衣</text>
      <text v-else class="weather__hint">开启定位后可按实时天气推荐</text>
    </view>

    <view class="sec-title">
      <text class="sec-title__t">今日推荐</text>
      <text
        v-if="rec?.status === 'ok'"
        class="sec-title__link"
        @click="reload"
      >
        {{ loading ? '搭配中…' : '换一套 ↻' }}
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
      <view class="unlock__cta" @click="goCloset">
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

        <!-- 采纳这套去打卡：带入单品与来源 ai -->
        <view class="adopt" @click="goCheckIn(o.items)">
          <text>采纳这套去打卡</text>
        </view>
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
import {
  DEFAULT_CLOSET_NAME,
  type TodayRecommendation,
} from '@zhiyi/shared';
import AppLoading from '../../components/base/AppLoading.vue';
import AppTag from '../../components/base/AppTag.vue';
import AppIcon from '../../components/base/AppIcon.vue';
import { getTodayRecommendation } from '../../api/recommend.api';
import { getCoords } from '../../composables/useLocation';
import { useUserStore } from '../../store/user';
import { useSafeArea } from '../../composables/useSafeArea';

/** custom 导航栏下的安全区：顶栏下移避状态栏、右侧留白避微信胶囊 */
const { statusBarHeight, menuInset } = useSafeArea();

const rec = ref<TodayRecommendation | null>(null);
const loading = ref(true);
/**
 * 是否已首次加载过。
 * 今日推荐是首页，load() 含定位 + AI 生成（重操作），若每次 onShow（从任意
 * 二级页返回都会触发）都重跑，会拖慢并让「今天这套」意外变化。故只在首次进入
 * 时自动 load，返回态不刷新；用户想换用「换一套」手动触发。
 */
const loaded = ref(false);
const userStore = useUserStore();

/** 衣柜名：登录后取用户自定义名，未就绪用默认名兜底 */
const closetName = computed(
  () => userStore.user?.closetName || DEFAULT_CLOSET_NAME,
);

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
    loaded.value = true;
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

// 首次进入才自动 load；返回态（loaded 已 true）不重跑，避免重复定位/生成
onShow(() => {
  if (!loaded.value) load();
});

/** 进我的衣橱（含搜索/筛选/录入） */
function goCloset() {
  uni.navigateTo({ url: '/pages/closet/closet' });
}

/** 进穿搭日记（月历回看） */
function goDiary() {
  uni.navigateTo({ url: '/pages/diary/diary' });
}

/** 进智能搭配（场合/风格/季节多维切换） */
function goMatch() {
  uni.navigateTo({ url: '/pages/match/match' });
}

/** 进衣橱看板（洞察） */
function goBoard() {
  uni.navigateTo({ url: '/pages/board/board' });
}

/** 跳衣物详情 */
function goDetail(id: string) {
  uni.navigateTo({ url: `/pages/garment/detail?id=${id}` });
}

/**
 * 采纳这套去打卡：带入该套单品 id 与来源 ai，跳打卡页。
 * 用户在打卡页仍可增减单品、补场合备注。
 * @param items 该套搭配的完整单品（取 id 传入）
 */
function goCheckIn(items: { id: string }[]) {
  const itemIds = items.map((i) => i.id).join(',');
  uni.navigateTo({
    url: `/pages/diary/check-in?source=ai&itemIds=${itemIds}`,
  });
}
</script>

<style lang="scss">
.home {
  min-height: 100vh;
  background: $zy-bg;
  padding: 0 $zy-gap-lg $zy-gap-lg;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
}
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
}
.logo {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: $zy-accent;
  color: #fff;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.name {
  font-size: 18px;
  font-weight: 700;
  color: $zy-ink;
}
.tools {
  display: flex;
  align-items: center;
  gap: 18px;
}
.tool {
  display: flex;
  align-items: center;
  justify-content: center;
}
.searchwrap {
  padding: 2px 0 12px;
}
.search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: $zy-surface;
  border: 1px solid $zy-line;
  border-radius: $zy-radius-sm;
}
.search__ph {
  flex: 1;
  font-size: 14px;
  color: $zy-ink-3;
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
.sec-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 24px;
}
.sec-title__t {
  font-size: 17px;
  font-weight: 700;
  color: $zy-ink;
}
.sec-title__link {
  font-size: 13px;
  color: $zy-ink-2;
}
.state {
  padding-top: 80px;
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
  margin-top: 16px;
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
.adopt {
  margin-top: 14px;
  text-align: center;
  padding: 12px;
  border-radius: $zy-radius-sm;
  background: $zy-accent;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 60px;
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
