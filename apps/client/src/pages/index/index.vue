<template>
  <view class="home">
    <!-- 顶栏：左侧品牌区竖排跨两行高度居中；右侧用与胶囊等高的占位块预留胶囊空间，
         图标工具栏紧跟其下自成第二行——如此图标必落在胶囊正下方，各机型胶囊高度不一也不会被遮。
         custom 导航栏下 paddingTop=胶囊上沿 y 坐标，整体避开状态栏/刘海。 -->
    <view class="topbar" :style="{ paddingTop: menuTop + 'px' }">
      <!-- 左：品牌区，logo + 衣柜名 + 副标题，竖排跨两行高并垂直居中 -->
      <view class="brand">
        <view class="logo">衣</view>
        <view class="brand__text">
          <text class="name">{{ closetName }}</text>
          <text v-if="garmentCount != null" class="brand__tip">
            {{ garmentCount }} 件 · 点击管理
          </text>
        </view>
      </view>
      <!-- 右：竖排。首为等高占位块（让位悬浮胶囊），次为图标工具栏 -->
      <view class="toprail">
        <!-- 占位块：高度=胶囊高度，把下方图标行顶到胶囊之下 -->
        <view class="toprail__cap" :style="{ height: menuHeight + 'px' }" />
        <view class="tools">
          <view class="tool" @click="goCloset">
            <AppIcon name="closet" :size="38" color="#6b6862" />
          </view>
          <view class="tool" @click="goDiary">
            <AppIcon name="diary" :size="38" color="#6b6862" />
          </view>
          <view class="tool" @click="goMatch">
            <AppIcon name="match" :size="38" color="#6b6862" />
          </view>
          <view class="tool" @click="goBoard">
            <AppIcon name="board" :size="38" color="#6b6862" />
          </view>
          <view class="tool" @click="goSettings">
            <AppIcon name="settings" :size="38" color="#6b6862" />
          </view>
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

    <!-- 天气卡：有天气出实况（左栏温度/城市/体感，右栏湿度/风力/降水），
         无天气（未配置/未授权定位）出中性占位 -->
    <view class="weather">
      <template v-if="rec?.weather">
        <view class="weather__left">
          <text class="weather__temp">{{ Math.round(rec.weather.temp) }}°</text>
          <text class="weather__loc">
            <text v-if="rec.weather.city">{{ rec.weather.city }} · </text>{{ rec.weather.desc }}
          </text>
          <text class="weather__feels">体感 {{ Math.round(rec.weather.feels) }}°</text>
        </view>
        <view class="weather__right">
          <text v-if="rec.weather.humidity != null" class="weather__item">
            湿度 {{ rec.weather.humidity }}%
          </text>
          <text v-if="rec.weather.windDir" class="weather__item">
            {{ rec.weather.windDir }}{{ rec.weather.windScale ? ` ${rec.weather.windScale} 级` : '' }}
          </text>
          <text class="weather__item">{{ rainText }}</text>
        </view>
      </template>
      <template v-else>
        <view class="weather__left">
          <text class="weather__temp">—°</text>
          <text class="weather__loc">天气按季节估算</text>
          <text class="weather__feels">开启定位后可按实时天气推荐</text>
        </view>
      </template>
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

    <!-- 悬浮添加按钮：首页直接录入，录入后件数变化可能解锁/刷新推荐（PRD 4.1 生命线） -->
    <view class="fab" @click="showAdd = true">
      <AppIcon name="plus" :size="40" color="#fff" />
      <text class="fab__t">添加衣物</text>
    </view>

    <!-- 录入弹层 -->
    <AddGarmentSheet v-model:show="showAdd" @created="onCreated" />
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
import AddGarmentSheet from '../../components/garment/AddGarmentSheet.vue';
import { getTodayRecommendation } from '../../api/recommend.api';
import { getCoords } from '../../composables/useLocation';
import { useUserStore } from '../../store/user';
import { useSafeArea } from '../../composables/useSafeArea';

/** custom 导航栏下的安全区：顶栏下移避状态栏、右侧留白避微信胶囊 */
const { menuTop, menuHeight } = useSafeArea();

const rec = ref<TodayRecommendation | null>(null);
const loading = ref(true);
/**
 * 是否已首次加载过。
 * 今日推荐是首页，load() 含定位 + AI 生成（重操作），若每次 onShow（从任意
 * 二级页返回都会触发）都重跑，会拖慢并让「今天这套」意外变化。故只在首次进入
 * 时自动 load，返回态不刷新；用户想换用「换一套」手动触发。
 */
const loaded = ref(false);
/** 录入弹层开关：首页直接添加衣物（PRD 首页录入入口） */
const showAdd = ref(false);
const userStore = useUserStore();

/** 衣柜名：登录后取用户自定义名，未就绪用默认名兜底 */
const closetName = computed(
  () => userStore.user?.closetName || DEFAULT_CLOSET_NAME,
);

/** 衣物件数：来自今日推荐接口；rec 未加载时为 null，副标题隐去 */
const garmentCount = computed(() => rec.value?.garmentCount ?? null);

/** 解锁进度百分比（封顶 100），locked 态用 */
const progress = computed(() => {
  if (!rec.value) return 0;
  const { garmentCount, unlockThreshold } = rec.value;
  return Math.min(100, Math.round((garmentCount / unlockThreshold) * 100));
});

/**
 * 降水展示文案：now 接口只给降水量（mm），无概率。
 * 有降水量则显示具体毫米数，否则显示「无降水」——按和风实际返回合理展示，不编造概率。
 */
const rainText = computed(() => {
  const precip = rec.value?.weather?.precip;
  if (precip == null) return '无降水';
  return precip > 0 ? `降水 ${precip}mm` : '无降水';
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

/**
 * 录入成功：关弹层 + 重新生成推荐。
 * 件数变化可能跨过解锁阈值或改变可搭配单品，故强制刷新（不受 loaded 拦截）。
 */
function onCreated() {
  showAdd.value = false;
  uni.showToast({ title: '已添加', icon: 'success' });
  load();
}

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

/** 进设置（衣柜名/分类管理/全身照删除） */
function goSettings() {
  uni.navigateTo({ url: '/pages/settings/settings' });
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
  /* 右列高度（胶囊占位块+图标）撑起顶栏；两列底部对齐，
     使左侧 logo 与右侧图标行齐底，图标仍落在胶囊正下方 */
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding-bottom: 4px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.brand__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.toprail {
  /* 右列竖排：胶囊等高占位块在上，图标工具栏在下 */
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.toprail__cap {
  /* 纯占位，不渲染任何内容，仅把图标行顶到胶囊下方 */
  flex-shrink: 0;
}
.brand__tip {
  font-size: 11px;
  color: $zy-ink-3;
  margin-top: 2px;
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
  /* 单行不换行，避免被压窄时「我的衣橱」折成两行 */
  white-space: nowrap;
}
.tools {
  /* 落在胶囊占位块正下方那一行；留一点上间距与胶囊分隔。
     五图标后宽度吃紧：图标 38 + 间距 6，避免挤得左侧品牌区换行 */
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
}
.tool {
  display: flex;
  align-items: center;
  justify-content: center;
  /* 纯线条图标，无常驻底色——回归 demo 简约调性，右侧减重与左侧 logo 一重一轻更平衡 */
  width: 36px;
  height: 36px;
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
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 16px;
  background: $zy-accent;
  border-radius: $zy-radius;
  padding: 22px 20px;
  color: #fff;
}
.weather__left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.weather__temp {
  font-size: 44px;
  font-weight: 700;
  line-height: 1.1;
  color: #fff;
}
.weather__loc {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.92);
}
.weather__feels {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}
.weather__right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 6px;
}
.weather__item {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
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
/* 悬浮添加按钮：对齐 demo，墨黑胶囊居中悬浮（docs/demo.html .fab） */
.fab {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  /* 避让全面屏底部 home indicator，横条机型也不会压住按钮 */
  bottom: calc(28px + constant(safe-area-inset-bottom));
  bottom: calc(28px + env(safe-area-inset-bottom));
  z-index: 90;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 52px;
  padding: 0 24px;
  border-radius: 30px;
  background: $zy-accent;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
}
.fab__t {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
}
</style>
