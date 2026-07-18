<template>
  <view class="home">
    <!-- 顶栏：衣柜名 + 件数 + 今日推荐入口。
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
      <view class="topbar__right">
        <view class="entry" @click="goBoard">
          <text class="entry__t">看板</text>
        </view>
        <view class="entry" @click="goDiary">
          <text class="entry__t">日记</text>
        </view>
        <view class="today-entry" @click="goToday">
          <text class="today-entry__t">今日推荐</text>
        </view>
        <text v-if="!loading" class="count">{{ garments.length }} 件</text>
      </view>
    </view>

    <!-- 搜索框：一个框搜所有维度 + 状态词（PRD 4.4）。有衣物时才显示 -->
    <view v-if="!loading && garments.length > 0" class="searchwrap">
      <view class="search">
        <text class="search__ico">🔍</text>
        <input
          class="search__input"
          v-model="keyword"
          placeholder="搜关键词、颜色、风格、场合…"
          confirm-type="search"
          @focus="suggestOpen = true"
          @blur="onSearchBlur"
        />
        <text v-if="keyword" class="search__clr" @click="clearKeyword">×</text>
      </view>

      <!-- 联想标签：聚焦时出，从衣橱现有数据 + 状态词生成（PRD 4.4 输入即联想） -->
      <view v-if="suggestOpen && suggestions.length" class="suggest">
        <view
          v-for="s in suggestions"
          :key="s"
          class="suggest__chip"
          @click="applySuggestion(s)"
        >
          {{ s }}
        </view>
      </view>
    </view>

    <!-- 加载中 -->
    <view v-if="loading" class="state">
      <AppLoading text="正在加载衣橱…" />
    </view>

    <!-- 首启空态：欢迎 + 引导添加第一件（PRD 4.9 冷启动） -->
    <view v-else-if="garments.length === 0" class="empty">
      <text class="empty-t">拍下第一件衣服，我来帮你打理</text>
      <text class="empty-s">添加 3-5 件，解锁第一套专属搭配</text>
      <view class="empty-cta" @click="showAdd = true">
        <text>添加第一件衣服</text>
      </view>
    </view>

    <!-- 搜索态：命中结果网格，无结果走空态（PRD 5.6.4） -->
    <template v-else-if="searching">
      <view class="search-summary">
        “<text class="search-summary__kw">{{ keyword.trim() }}</text>” 找到
        <text class="search-summary__kw">{{ searchResult.length }}</text> 件
      </view>
      <view v-if="searchResult.length === 0" class="empty">
        <text class="empty-t">没找到相关衣物，换个词试试</text>
        <view class="suggest suggest--inline">
          <view
            v-for="s in suggestions"
            :key="s"
            class="suggest__chip"
            @click="applySuggestion(s)"
          >
            {{ s }}
          </view>
        </view>
      </view>
      <view v-else class="grid">
        <GarmentCard
          v-for="item in searchResult"
          :key="item.id"
          :garment="item"
          @tap="goDetail(item.id)"
        />
      </view>
    </template>

    <!-- 有衣物：分类筛选 + 网格 -->
    <template v-else>
      <!-- 分类筛选：全部 + 服装组 + 配饰组 -->
      <scroll-view class="filter" scroll-x :show-scrollbar="false">
        <view class="filter__row">
          <view
            class="chip"
            :class="{ 'chip--on': activeCategory === ALL }"
            @click="activeCategory = ALL"
          >
            全部
          </view>
          <view class="chip-group">
            <view
              v-for="c in clothingCategories"
              :key="c"
              class="chip"
              :class="{ 'chip--on': activeCategory === c }"
              @click="activeCategory = c"
            >
              {{ c }}
            </view>
          </view>
          <view class="chip-divider" />
          <view class="chip-group">
            <view
              v-for="c in accessoryCategories"
              :key="c"
              class="chip"
              :class="{ 'chip--on': activeCategory === c }"
              @click="activeCategory = c"
            >
              {{ c }}
            </view>
          </view>
        </view>
      </scroll-view>

      <!-- 筛选后为空：分类空态（PRD 5.6.4） -->
      <view v-if="filtered.length === 0" class="empty">
        <text class="empty-t">这个分类还没有衣物</text>
        <text class="empty-s">换个分类看看，或添加一件</text>
      </view>

      <!-- 衣物网格 -->
      <view v-else class="grid">
        <GarmentCard
          v-for="item in filtered"
          :key="item.id"
          :garment="item"
          @tap="goDetail(item.id)"
        />
      </view>
    </template>

    <!-- 悬浮添加按钮 -->
    <view class="fab" @click="showAdd = true">
      <text>＋ 添加衣物</text>
    </view>

    <!-- 录入弹层 -->
    <AddGarmentSheet v-model:show="showAdd" @created="onCreated" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
  CLOTHING_CATEGORIES,
  ACCESSORY_CATEGORIES,
  DEFAULT_CLOSET_NAME,
  searchGarments,
  suggestKeywords,
  type Garment,
} from '@zhiyi/shared';
import AddGarmentSheet from '../../components/garment/AddGarmentSheet.vue';
import GarmentCard from '../../components/garment/GarmentCard.vue';
import AppLoading from '../../components/base/AppLoading.vue';
import { listGarments } from '../../api/garment.api';
import { useUserStore } from '../../store/user';
import { useSafeArea } from '../../composables/useSafeArea';

/** custom 导航栏下的安全区：顶栏下移避状态栏、右侧留白避微信胶囊 */
const { statusBarHeight, menuInset } = useSafeArea();

/** “全部”筛选标识（用不会与品类冲突的常量） */
const ALL = '__all__';

const garments = ref<Garment[]>([]);
const loading = ref(true);
const showAdd = ref(false);
const activeCategory = ref<string>(ALL);

/** 搜索关键词；非空即进入搜索态（覆盖分类筛选） */
const keyword = ref('');
/** 联想标签浮层是否展开（聚焦时开，选词/失焦后收） */
const suggestOpen = ref(false);

const clothingCategories = CLOTHING_CATEGORIES;
const accessoryCategories = ACCESSORY_CATEGORIES;

const userStore = useUserStore();
/** 衣柜名：登录后取用户自定义名，未就绪用默认名兜底 */
const closetName = computed(
  () => userStore.user?.closetName || DEFAULT_CLOSET_NAME,
);

/** 是否处于搜索态：关键词非空 */
const searching = computed(() => keyword.value.trim().length > 0);

/** 搜索结果（多维匹配 + 状态词，算法在 shared） */
const searchResult = computed(() => searchGarments(garments.value, keyword.value));

/** 联想词：从衣橱现有数据 + 状态词生成，随输入过滤 */
const suggestions = computed(() =>
  suggestKeywords(garments.value, keyword.value),
);

/** 按当前选中品类过滤；“全部”时不过滤 */
const filtered = computed(() => {
  if (activeCategory.value === ALL) return garments.value;
  return garments.value.filter((g) => g.category === activeCategory.value);
});

/** 点选联想词：落定关键词并收起浮层 */
function applySuggestion(word: string) {
  keyword.value = word;
  suggestOpen.value = false;
}

/** 清空关键词，回落到分类筛选 */
function clearKeyword() {
  keyword.value = '';
  suggestOpen.value = false;
}

// 失焦延迟收起浮层，避免点击联想词时浮层先消失导致 click 落空
function onSearchBlur() {
  setTimeout(() => {
    suggestOpen.value = false;
  }, 150);
}

/**
 * 加载衣橱列表。
 * 先确保已登录（onLaunch 的登录可能尚未完成，此处幂等自愈，避免首帧 401）。
 * 失败提示已由请求器统一处理，这里只兜底停 loading。
 */
async function loadGarments() {
  loading.value = true;
  try {
    await userStore.ensureLogin();
    garments.value = await listGarments();
  } catch {
    // 错误提示已由 request / ensureLogin 统一处理
  } finally {
    loading.value = false;
  }
}

// 每次进入页面刷新（录入返回、详情返回都会触发），保证列表最新
onShow(() => {
  loadGarments();
});

/** 录入成功：关弹层 + 刷新列表 */
function onCreated() {
  showAdd.value = false;
  uni.showToast({ title: '已添加', icon: 'success' });
  loadGarments();
}

/** 跳衣物详情 */
function goDetail(id: string) {
  uni.navigateTo({ url: `/pages/garment/detail?id=${id}` });
}

/** 进今日推荐 */
function goToday() {
  uni.navigateTo({ url: '/pages/today/today' });
}

/** 进穿搭日记（月历回看） */
function goDiary() {
  uni.navigateTo({ url: '/pages/diary/diary' });
}

/** 进衣橱看板（洞察） */
function goBoard() {
  uni.navigateTo({ url: '/pages/board/board' });
}
</script>

<style lang="scss">
.home {
  min-height: 100vh;
  background: $zy-bg;
  padding-bottom: 120px;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
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
.topbar__right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.today-entry {
  padding: 6px 14px;
  border-radius: $zy-radius-pill;
  background: $zy-accent;
}
.today-entry__t {
  font-size: 12px;
  font-weight: 600;
  color: #fff;
}
.entry {
  padding: 6px 14px;
  border-radius: $zy-radius-pill;
  background: $zy-surface;
  border: 1px solid $zy-line;
}
.entry__t {
  font-size: 12px;
  font-weight: 600;
  color: $zy-ink-2;
}
.count {
  font-size: 13px;
  color: $zy-ink-2;
}
.state {
  padding-top: 160px;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 140px;
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
.searchwrap {
  padding: 2px 20px 8px;
  position: relative;
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
.search__ico {
  font-size: 14px;
  color: $zy-ink-3;
}
.search__input {
  flex: 1;
  font-size: 14px;
  color: $zy-ink;
}
.search__clr {
  font-size: 18px;
  color: $zy-ink-3;
  padding: 0 4px;
}
.suggest {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.suggest--inline {
  justify-content: center;
  margin-top: 20px;
}
.suggest__chip {
  padding: 6px 14px;
  background: $zy-surface;
  border: 1px solid $zy-line;
  border-radius: $zy-radius-pill;
  font-size: 13px;
  color: $zy-ink-2;
}
.search-summary {
  padding: 0 20px 12px;
  font-size: 13px;
  color: $zy-ink-2;
}
.search-summary__kw {
  color: $zy-ink;
  font-weight: 700;
}
.filter {
  white-space: nowrap;
  padding: 4px 0 12px;
}
.filter__row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px;
}
.chip-group {
  display: inline-flex;
  gap: 8px;
}
.chip-divider {
  width: 1px;
  height: 20px;
  background: $zy-line;
  margin: 0 4px;
}
.chip {
  display: inline-block;
  padding: 8px 16px;
  background: $zy-surface;
  border: 1px solid $zy-line;
  border-radius: $zy-radius-pill;
  font-size: 13px;
  font-weight: 600;
  color: $zy-ink-2;
}
.chip--on {
  background: $zy-accent;
  color: #fff;
  border-color: $zy-accent;
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20rpx;
  padding: 0 20px;
}
.fab {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  /* 避让全面屏底部 home indicator，横条机型也不会压住按钮 */
  bottom: calc(40px + constant(safe-area-inset-bottom));
  bottom: calc(40px + env(safe-area-inset-bottom));
  padding: 14px 28px;
  border-radius: 30px;
  background: $zy-accent;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}
</style>
