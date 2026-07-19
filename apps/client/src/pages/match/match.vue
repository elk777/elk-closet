<template>
  <view class="match">
    <!-- 三维度切换：场合 / 风格 / 季节，单行横滑 chip -->
    <view class="dims">
      <view class="dim">
        <text class="dim__label">场合</text>
        <scroll-view class="dim__scroll" scroll-x :show-scrollbar="false">
          <view class="dim__row">
            <view
              class="chip"
              :class="{ 'chip--on': !occasion }"
              @click="pickOccasion('')"
            >
              不限
            </view>
            <view
              v-for="o in occasionOptions"
              :key="o"
              class="chip"
              :class="{ 'chip--on': occasion === o }"
              @click="pickOccasion(o)"
            >
              {{ o }}
            </view>
          </view>
        </scroll-view>
      </view>

      <view class="dim">
        <text class="dim__label">风格</text>
        <scroll-view class="dim__scroll" scroll-x :show-scrollbar="false">
          <view class="dim__row">
            <view
              class="chip"
              :class="{ 'chip--on': !style }"
              @click="pickStyle('')"
            >
              不限
            </view>
            <view
              v-for="s in styleOptions"
              :key="s"
              class="chip"
              :class="{ 'chip--on': style === s }"
              @click="pickStyle(s)"
            >
              {{ s }}
            </view>
          </view>
        </scroll-view>
      </view>

      <view class="dim">
        <text class="dim__label">季节</text>
        <scroll-view class="dim__scroll" scroll-x :show-scrollbar="false">
          <view class="dim__row">
            <view
              v-for="s in seasonOptions"
              :key="s"
              class="chip"
              :class="{ 'chip--on': season === s }"
              @click="pickSeason(s)"
            >
              {{ s }}
            </view>
          </view>
        </scroll-view>
      </view>
    </view>

    <!-- 加载中 -->
    <view v-if="loading" class="state">
      <AppLoading text="正在为你搭配…" />
    </view>

    <!-- 整个衣橱件数不足：解锁引导 -->
    <view v-else-if="res?.status === 'locked'" class="hint">
      <text class="hint__t">
        再添 {{ res.unlockThreshold - res.garmentCount }} 件，解锁智能搭配
      </text>
      <text class="hint__s">衣橱里有 {{ res.unlockThreshold }} 件以上，我才好帮你搭</text>
      <view class="hint__cta" @click="goAddGarment">
        <text>去添加衣物</text>
      </view>
    </view>

    <!-- 当季衣物不足：提示换季节或添当季 -->
    <view v-else-if="res?.status === 'thin'" class="hint">
      <text class="hint__t">{{ season }}季的衣物还不太够</text>
      <text class="hint__s">换个季节看看，或给衣橱添几件{{ season }}装</text>
      <view class="hint__cta" @click="goAddGarment">
        <text>去添加衣物</text>
      </view>
    </view>

    <!-- 有搭配：套装卡列表 -->
    <view v-else-if="res?.status === 'ok'" class="outfits">
      <view v-for="(o, i) in res.outfits" :key="i" class="outfit">
        <view class="outfit__head">
          <view class="outfit__tags">
            <AppTag v-if="o.occasion">{{ o.occasion }}</AppTag>
            <AppTag v-if="o.styleTag">{{ o.styleTag }}</AppTag>
          </view>
          <text class="outfit__score">匹配度 {{ o.matchScore }}</text>
        </view>

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

        <text class="outfit__reason">{{ o.reason }}</text>

        <view class="outfit__actions">
          <view class="act act--ghost" @click="onTryOn">
            <text>试穿看</text>
          </view>
          <view class="act act--solid" @click="goCheckIn(o.items)">
            <text>采纳去打卡</text>
          </view>
        </view>
      </view>

      <!-- 换一批 -->
      <view class="refresh" :class="{ 'refresh--busy': loading }" @click="reload">
        <text>{{ loading ? '搭配中…' : '换一批' }}</text>
      </view>
    </view>

    <!-- 料够但没搭出来：兜底 -->
    <view v-else-if="res?.status === 'empty'" class="empty">
      <text class="empty-t">这组条件下没搭出满意的</text>
      <text class="empty-s">换个维度试试，或去衣橱自己挑挑</text>
      <view class="empty-cta" @click="reload">
        <text>再试一次</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  OCCASION_OPTIONS,
  SEASONS,
  STYLE_OPTIONS,
  seasonOfMonth,
  type MatchedOutfits,
  type Season,
} from '@zhiyi/shared';
import AppLoading from '../../components/base/AppLoading.vue';
import AppTag from '../../components/base/AppTag.vue';
import { getMatchedOutfits } from '../../api/recommend.api';
import { useUserStore } from '../../store/user';

const occasionOptions = OCCASION_OPTIONS;
const styleOptions = STYLE_OPTIONS;
const seasonOptions = SEASONS;

const res = ref<MatchedOutfits | null>(null);
const loading = ref(true);
const userStore = useUserStore();

// 维度状态：场合/风格默认不限；季节默认跟随当前月份
const occasion = ref<string>('');
const style = ref<string>('');
const season = ref<Season>(seasonOfMonth());

/**
 * 拉取智能搭配。任一维度变更即重新请求（AI 生成，带 loading）。
 * 失败提示由请求器统一处理，这里只兜底停 loading。
 */
async function load() {
  loading.value = true;
  try {
    await userStore.ensureLogin();
    res.value = await getMatchedOutfits({
      occasion: occasion.value || undefined,
      style: style.value || undefined,
      season: season.value,
    });
  } catch {
    // 提示已由 request / ensureLogin 统一处理
  } finally {
    loading.value = false;
  }
}

/** 换一批：同维度重新生成 */
function reload() {
  if (loading.value) return;
  load();
}

function pickOccasion(o: string) {
  if (loading.value || occasion.value === o) return;
  occasion.value = o;
  load();
}

function pickStyle(s: string) {
  if (loading.value || style.value === s) return;
  style.value = s;
  load();
}

function pickSeason(s: Season) {
  if (loading.value || season.value === s) return;
  season.value = s;
  load();
}

onLoad(() => {
  load();
});

/** 去衣橱添加：衣橱已独立成页，显式跳转（不能靠 navigateBack，来源页不定） */
function goAddGarment() {
  uni.navigateTo({ url: '/pages/closet/closet' });
}

/** 跳衣物详情 */
function goDetail(id: string) {
  uni.navigateTo({ url: `/pages/garment/detail?id=${id}` });
}

/**
 * 试穿看：AI 试穿（PRD 4.5「每套可试穿看」）依赖多模态模型，
 * 当前网关无 vision 能力，功能尚未开放，先给出明确提示而非虚构能力。
 */
function onTryOn() {
  uni.showToast({ title: 'AI 试穿即将开放', icon: 'none' });
}

/**
 * 采纳这套去打卡：带入单品 id 与来源 ai，跳打卡页。
 * @param items 该套搭配的完整单品
 */
function goCheckIn(items: { id: string }[]) {
  const itemIds = items.map((i) => i.id).join(',');
  uni.navigateTo({
    url: `/pages/diary/check-in?source=ai&itemIds=${itemIds}`,
  });
}
</script>

<style lang="scss" scoped>
.match {
  min-height: 100vh;
  background: $zy-bg;
  padding: $zy-gap-lg;
}
.dims {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dim {
  display: flex;
  align-items: center;
  gap: 12px;
}
.dim__label {
  flex-shrink: 0;
  width: 32px;
  font-size: 13px;
  font-weight: 600;
  color: $zy-ink-2;
}
.dim__scroll {
  flex: 1;
  white-space: nowrap;
}
.dim__row {
  display: inline-flex;
  gap: 8px;
}
.chip {
  display: inline-block;
  padding: 7px 15px;
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
.state {
  padding-top: 120px;
}
.hint {
  margin-top: 60px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.hint__t {
  font-size: 17px;
  font-weight: 700;
  color: $zy-ink;
}
.hint__s {
  margin-top: 10px;
  font-size: 13px;
  color: $zy-ink-2;
  text-align: center;
}
.hint__cta {
  margin-top: 24px;
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
.outfit__actions {
  margin-top: 14px;
  display: flex;
  gap: 10px;
}
.act {
  flex: 1;
  text-align: center;
  padding: 12px;
  border-radius: $zy-radius-sm;
  font-size: 14px;
  font-weight: 600;
}
.act--ghost {
  background: $zy-surface;
  border: 1px solid $zy-line;
  color: $zy-ink-2;
}
.act--solid {
  background: $zy-accent;
  color: #fff;
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
