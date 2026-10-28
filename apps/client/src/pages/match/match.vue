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

    <!-- 自己挑一套：常驻入口，AI 搭不出/当季不足时也能手动组套试穿或打卡 -->
    <view class="diy" @click="openPicker">
      <text class="diy__t">自己挑一套</text>
      <text class="diy__s">手动选几件，试穿看或存为打卡</text>
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
          <view class="act act--ghost" @click="onTryOn(o.items)">
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

    <!-- 试穿看：结果 / 生成中 / 首次引导传全身照，同一弹层三态 -->
    <AppSheet v-model="tryOnVisible" title="试穿看">
      <!-- 首次：还没传全身照，先引导（含隐私提示） -->
      <view v-if="tryOnStep === 'need_body'" class="tryon">
        <text class="tryon__title">先上传一张全身照</text>
        <text class="tryon__tip">
          用来把这套穿到你身上看效果。照片只存你自己的衣橱，不公开、不用于训练，可随时删除。
        </text>
        <view class="tryon__cta" @click="uploadBody">
          <text>{{ uploading ? '上传中…' : '拍照 / 从相册选' }}</text>
        </view>
      </view>

      <!-- 生成中 -->
      <view v-else-if="tryOnStep === 'loading'" class="tryon">
        <AppLoading text="正在把这套穿到你身上…" />
        <text class="tryon__tip">预览效果 · 仅供参考</text>
      </view>

      <!-- 出图 -->
      <view v-else-if="tryOnStep === 'ok'" class="tryon">
        <image class="tryon__img" :src="tryOnImage" mode="widthFix" />
        <text class="tryon__tip">预览效果 · 仅供参考</text>
        <view class="tryon__actions">
          <view class="act act--ghost" @click="closeTryOn">
            <text>关闭</text>
          </view>
          <view class="act act--solid" @click="saveTryOnAsCheckIn">
            <text>存为今日穿搭</text>
          </view>
        </view>
      </view>

      <!-- 失败 -->
      <view v-else class="tryon">
        <text class="tryon__title">试穿生成失败</text>
        <text class="tryon__tip">图像生成偶尔会抽风，稍等片刻再试一次。</text>
        <view class="tryon__cta" @click="retryTryOn">
          <text>再试一次</text>
        </view>
      </view>
    </AppSheet>

    <!-- 自己挑一套：手动选单品，可试穿或存打卡 -->
    <AppSheet
      v-model="pickerVisible"
      title="自己挑一套"
      subtitle="建议挑 2-4 件搭成一套，也可只选一件"
    >
      <!-- 拉衣物中 -->
      <view v-if="loadingGarments" class="picker-state">
        <AppLoading text="正在打开衣橱…" />
      </view>

      <!-- 衣橱为空：引导去添加 -->
      <view v-else-if="allGarments.length === 0" class="picker-empty">
        <text class="picker-empty__t">衣橱还没有衣物</text>
        <text class="picker-empty__s">先去添加几件，再回来挑</text>
        <view class="picker-empty__cta" @click="goAddGarment">
          <text>去添加衣物</text>
        </view>
      </view>

      <!-- 候选网格：点选切换，选中高亮打勾 -->
      <template v-else>
        <scroll-view class="picker" scroll-y :show-scrollbar="false">
          <view class="picker__grid">
            <view
              v-for="g in allGarments"
              :key="g.id"
              class="cand"
              :class="{ 'cand--on': picked.has(g.id) }"
              @click="togglePick(g.id)"
            >
              <image
                class="cand__img"
                :src="g.cutoutImageUrl || g.originalImageUrl"
                mode="aspectFill"
              />
              <view v-if="picked.has(g.id)" class="cand__check">
                <text>✓</text>
              </view>
              <text class="cand__name">{{ g.name }}</text>
            </view>
          </view>
        </scroll-view>

        <view class="picker__actions">
          <view class="act act--ghost" @click="pickedCheckIn">
            <text>存为打卡</text>
          </view>
          <view class="act act--solid" @click="pickedTryOn">
            <text>试穿看（{{ pickedIds.length }}）</text>
          </view>
        </view>
      </template>
    </AppSheet>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  OCCASION_OPTIONS,
  SEASONS,
  STYLE_OPTIONS,
  seasonOfMonth,
  type Garment,
  type MatchedOutfits,
  type Season,
} from '@zhiyi/shared';
import AppLoading from '../../components/base/AppLoading.vue';
import AppSheet from '../../components/base/AppSheet.vue';
import AppTag from '../../components/base/AppTag.vue';
import { getMatchedOutfits } from '../../api/recommend.api';
import { listGarments } from '../../api/garment.api';
import { tryOnOutfit, saveBodyPhoto } from '../../api/tryon.api';
import { useUpload } from '../../composables/useUpload';
import { useToast } from '../../composables/useToast';
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

// ── 试穿状态 ──
const { uploading, chooseAndUpload } = useUpload();
const toast = useToast();
/** 试穿弹层是否可见 */
const tryOnVisible = ref(false);
/** 试穿弹层内四态：引导传全身照 / 生成中 / 出图 / 失败 */
const tryOnStep = ref<'need_body' | 'loading' | 'ok' | 'failed'>('loading');
/** 生成的上身图 URL */
const tryOnImage = ref('');
/** 当前正在试穿的这套单品 id（存为打卡时带走） */
const tryOnItemIds = ref<string[]>([]);

// AppSheet 只 emit update:modelValue，遮罩关闭时补清理临时态（避免下次残留旧图）
watch(tryOnVisible, (v) => {
  if (!v) tryOnImage.value = '';
});

// ── 自己挑一套（搭不出时兜底 + 手动组套试穿/打卡）──
/** 选衣器弹层是否可见 */
const pickerVisible = ref(false);
/** 全量衣物（首次打开选衣器时懒加载） */
const allGarments = ref<Garment[]>([]);
/** 是否正在拉衣物 */
const loadingGarments = ref(false);
/** 已选单品 id 集合（Set 便于点选切换） */
const picked = ref<Set<string>>(new Set());
/** 已选 id 数组（模板计数与提交用；Set 无法直接被模板计数） */
const pickedIds = computed(() => [...picked.value]);

/**
 * 拉取智能搭配。任一维度变更即重新请求（AI 生成，带 loading）。
 * 失败提示由请求器统一处理，这里只兜底停 loading。
 * @param forceRefresh 是否绕过服务端当日缓存（「换一批」用）
 */
async function load(forceRefresh = false) {
  loading.value = true;
  try {
    await userStore.ensureLogin();
    res.value = await getMatchedOutfits({
      occasion: occasion.value || undefined,
      style: style.value || undefined,
      season: season.value,
      forceRefresh: forceRefresh || undefined,
    });
  } catch {
    // 提示已由 request / ensureLogin 统一处理
  } finally {
    loading.value = false;
  }
}

/** 换一批：同维度重新生成（显式跳过缓存，否则会拿到同一套） */
function reload() {
  if (loading.value) return;
  load(true);
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
 * 试穿看：把这套穿到用户全身照上（PRD 4.6「整套一次上身」）。
 * 打开弹层并发起试穿；后端若返回 no_body 则弹层切到「引导传全身照」。
 * @param items 该套搭配的完整单品
 */
function onTryOn(items: { id: string }[]) {
  tryOnItemIds.value = items.map((i) => i.id);
  tryOnVisible.value = true;
  runTryOn();
}

/** 发起试穿请求，按后端三态驱动弹层。 */
async function runTryOn() {
  tryOnStep.value = 'loading';
  try {
    const r = await tryOnOutfit({
      itemIds: tryOnItemIds.value,
      occasion: occasion.value || undefined,
      style: style.value || undefined,
    });
    if (r.status === 'no_body') {
      tryOnStep.value = 'need_body';
    } else if (r.status === 'ok') {
      tryOnImage.value = r.imageUrl;
      tryOnStep.value = 'ok';
    } else {
      tryOnStep.value = 'failed';
    }
  } catch {
    tryOnStep.value = 'failed';
  }
}

/** 引导态里选图上传全身照，成功后自动接着试穿。 */
async function uploadBody() {
  if (uploading.value) return;
  const uploaded = await chooseAndUpload('body');
  if (!uploaded) return;
  try {
    await saveBodyPhoto(uploaded.imageUrl);
  } catch {
    toast.error('全身照保存失败，请重试');
    return;
  }
  // 同步进 store：设置页的全身照预览/删除入口读的是 store，不能等下次重新登录才可见
  if (userStore.user) {
    userStore.user = { ...userStore.user, bodyPhotoUrl: uploaded.imageUrl };
  }
  runTryOn();
}

/** 失败态重试。 */
function retryTryOn() {
  runTryOn();
}

/** 关闭试穿弹层并复位。 */
function closeTryOn() {
  tryOnVisible.value = false;
  tryOnImage.value = '';
}

/**
 * 把试穿这套存为今日穿搭：带单品 id 与来源 tryon 跳打卡页。
 * 试穿图本身已在 tryon 目录，打卡照仍由用户在打卡页决定（保持日记「美照」语义）。
 */
function saveTryOnAsCheckIn() {
  const itemIds = tryOnItemIds.value.join(',');
  closeTryOn();
  uni.navigateTo({
    url: `/pages/diary/check-in?source=tryon&itemIds=${itemIds}`,
  });
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

/**
 * 打开「自己挑一套」选衣器：首次打开懒加载全量衣物。
 * 无论搭配四态如何都可进入——搭不出时的兜底，也是手动组套试穿的入口。
 */
async function openPicker() {
  pickerVisible.value = true;
  if (allGarments.value.length || loadingGarments.value) return;
  loadingGarments.value = true;
  try {
    await userStore.ensureLogin();
    allGarments.value = await listGarments();
  } catch {
    // 提示已由 request / ensureLogin 统一处理
  } finally {
    loadingGarments.value = false;
  }
}

/** 选衣器内点选切换（Set 增删后同步触发 computed 重算） */
function togglePick(id: string) {
  const next = new Set(picked.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  picked.value = next;
}

/** 手挑这套去试穿：关选衣器，复用试穿状态机（与 AI 套装同一条链路）。 */
function pickedTryOn() {
  if (pickedIds.value.length === 0) {
    toast.info('先挑一件吧');
    return;
  }
  pickerVisible.value = false;
  onTryOn(pickedIds.value.map((id) => ({ id })));
}

/** 手挑这套去打卡：带单品 id 与来源 manual 跳打卡页。 */
function pickedCheckIn() {
  if (pickedIds.value.length === 0) {
    toast.info('先挑一件吧');
    return;
  }
  pickerVisible.value = false;
  uni.navigateTo({
    url: `/pages/diary/check-in?source=manual&itemIds=${pickedIds.value.join(',')}`,
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

/* ── 试穿弹层：四态共用容器 ── */
.tryon {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 8px 0 4px;
}
.tryon__title {
  font-size: 16px;
  font-weight: 700;
  color: $zy-ink;
}
.tryon__tip {
  font-size: 13px;
  color: $zy-ink-2;
  text-align: center;
  line-height: 1.6;
}
.tryon__img {
  width: 100%;
  border-radius: $zy-radius-sm;
  background: $zy-bg;
}
.tryon__cta {
  margin-top: 4px;
  padding: 13px 32px;
  border-radius: 30px;
  background: $zy-accent;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
}
.tryon__actions {
  margin-top: 4px;
  display: flex;
  gap: 10px;
  width: 100%;
}

/* 自己挑一套：常驻入口 */
.diy {
  margin-top: 14px;
  padding: 14px 16px;
  background: $zy-surface;
  border: 1px dashed $zy-line;
  border-radius: $zy-radius;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.diy__t {
  font-size: 15px;
  font-weight: 600;
  color: $zy-ink;
}
.diy__s {
  font-size: 12px;
  color: $zy-ink-3;
}

/* 选衣器弹层 */
.picker-state {
  padding: 40px 0;
}
.picker-empty {
  padding: 40px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.picker-empty__t {
  font-size: 15px;
  font-weight: 600;
  color: $zy-ink;
}
.picker-empty__s {
  margin-top: 8px;
  font-size: 13px;
  color: $zy-ink-2;
}
.picker-empty__cta {
  margin-top: 20px;
  padding: 12px 26px;
  border-radius: 30px;
  background: $zy-accent;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
}
.picker {
  max-height: 52vh;
}
.picker__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.cand {
  position: relative;
  width: 96px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.cand__img {
  width: 96px;
  height: 96px;
  border-radius: $zy-radius-sm;
  background: $zy-bg;
}
.cand--on .cand__img {
  outline: 2px solid $zy-accent;
  outline-offset: 1px;
}
.cand__check {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: $zy-accent;
  color: #fff;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cand__name {
  margin-top: 6px;
  width: 96px;
  font-size: 12px;
  color: $zy-ink-2;
  text-align: center;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.picker__actions {
  margin-top: 16px;
  display: flex;
  gap: 10px;
}
</style>
