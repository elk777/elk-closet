<template>
  <view class="edit">
    <!-- 加载中 -->
    <view v-if="loading" class="state">
      <AppLoading text="加载中…" />
    </view>

    <!-- 加载失败 / 不存在 -->
    <view v-else-if="!garment" class="state empty">
      <text class="empty-t">衣物不存在或已删除</text>
      <AppButton type="secondary" @click="goBack">返回</AppButton>
    </view>

    <template v-else>
      <!-- 主图区：点击换图；新图仅暂存本地，随保存一并生效 -->
      <view class="hero" @click="onChangeImage">
        <image class="hero__img" :src="previewUrl" mode="aspectFit" />
        <view class="hero__change">
          <text>{{ imageBusy ? '处理中…' : '换一张' }}</text>
        </view>
      </view>

      <!-- 属性表单：复用录入确认表单，编辑与录入同一套字段与规则 -->
      <view class="form">
        <RecognitionForm v-model="form" />
      </view>

      <view class="actions">
        <AppButton :loading="saving" :disabled="imageBusy" block @click="onSave">
          保存
        </AppButton>
      </view>

      <!-- 删除入口：红色小字 + 二次确认（软删，PRD 5.6.2），不用大按钮保持克制 -->
      <view class="danger" @click="onDelete">
        <text class="danger__t">删除这件衣物</text>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
/**
 * 衣物编辑页（PRD 4.3 编辑操作 + 5.6.2 软删除）。
 *
 * 复用录入确认表单 RecognitionForm 修正 AI 识别错漏；换主图闭环截图导入的
 * 「待补实物图」引导（换图保存后服务端解除 pendingPhoto 标记）；删除走软删。
 * 换图仅暂存本地 state，随保存提交——保存前反悔零成本。
 */
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import type { Garment } from '@zhiyi/shared';
import AppLoading from '../../components/base/AppLoading.vue';
import AppButton from '../../components/base/AppButton.vue';
import RecognitionForm, {
  type GarmentDraft,
} from '../../components/garment/RecognitionForm.vue';
import {
  detailGarment,
  updateGarment,
  deleteGarment,
  type UpdateGarmentPayload,
} from '../../api/garment.api';
import { useUpload } from '../../composables/useUpload';
import { useCutout } from '../../composables/useCutout';
import { useToast } from '../../composables/useToast';

const { uploading, chooseAndUpload } = useUpload();
const { cutting, cutout } = useCutout();

const garment = ref<Garment | null>(null);
const form = ref<GarmentDraft | null>(null);
const loading = ref(true);
const saving = ref(false);
const deleting = ref(false);
let garmentId = '';

/** 换图暂存：非 null 表示本次换过主图，保存时才随 payload 提交 */
const newOriginalUrl = ref<string | null>(null);
/** 新图的抠图结果；null=抠不出，主图回退新原图（与录入同规则） */
const newCutoutUrl = ref<string | null>(null);

/** 换图链路（上传 / 抠图）进行中 */
const imageBusy = computed(() => uploading.value || cutting.value);

/** 预览：换过图用新图（抠图优先），否则用衣物现有主图 */
const previewUrl = computed(() => {
  if (newOriginalUrl.value) return newCutoutUrl.value ?? newOriginalUrl.value;
  const g = garment.value;
  return g ? g.cutoutImageUrl || g.originalImageUrl : '';
});

/**
 * Garment → 表单草稿：brand/price 后端可为 null，转 undefined 表示「未填」；
 * styleTags 原样带上供表单只读展示。
 * @param g 衣物全量记录
 * @returns 可编辑草稿
 */
function toDraft(g: Garment): GarmentDraft {
  return {
    name: g.name,
    category: g.category,
    majorType: g.majorType,
    mainColor: g.mainColor,
    material: g.material,
    thickness: g.thickness,
    seasons: [...g.seasons],
    formality: g.formality,
    styleTags: [...g.styleTags],
    brand: g.brand ?? undefined,
    price: g.price ?? undefined,
  };
}

/** 拉全量详情（不信任跳转方传参），失败展示空态 */
async function load() {
  loading.value = true;
  try {
    const g = await detailGarment(garmentId);
    garment.value = g;
    form.value = toDraft(g);
  } catch {
    garment.value = null;
  } finally {
    loading.value = false;
  }
}

/** 换一张：选图直传 → 抠图（失败静默回退新原图），仅暂存本地 */
async function onChangeImage() {
  if (imageBusy.value) return;
  const up = await chooseAndUpload();
  if (!up) return;
  // 先亮新原图再等抠图：抠图要几秒，预览不该空等
  newOriginalUrl.value = up.imageUrl;
  newCutoutUrl.value = null;
  newCutoutUrl.value = await cutout(up.imageUrl);
}

/**
 * 组装更新 payload：表单全量可编辑字段（幂等，不做 diff）。
 * 规则——name 空不发送（视为未改）、brand 空→null、price 未填→null（后者两项
 * null 即清空）；换过图才附 originalImageUrl + cutoutImageUrl。
 * @returns 组好的 payload；季节为空时拦截并返回 null
 */
function buildPayload(): UpdateGarmentPayload | null {
  const f = form.value ?? {};
  const seasons = f.seasons ?? [];
  if (!seasons.length) {
    useToast().error('至少选一个季节');
    return null;
  }
  const brand = f.brand?.trim();
  const payload: UpdateGarmentPayload = {
    category: f.category,
    mainColor: f.mainColor,
    material: f.material,
    thickness: f.thickness,
    seasons,
    formality: f.formality,
    brand: brand || null,
    price: f.price ?? null,
  };
  const name = f.name?.trim();
  if (name) payload.name = name;
  if (newOriginalUrl.value) {
    payload.originalImageUrl = newOriginalUrl.value;
    payload.cutoutImageUrl = newCutoutUrl.value;
  }
  return payload;
}

/** 保存：成功回详情页（详情 onShow 自刷新，无需带回结果） */
async function onSave() {
  if (saving.value || imageBusy.value) return;
  const payload = buildPayload();
  if (!payload) return;
  saving.value = true;
  try {
    await updateGarment(garmentId, payload);
    useToast().success('已保存');
    uni.navigateBack();
  } catch {
    // 请求器已提示
  } finally {
    saving.value = false;
  }
}

/** 删除：二次确认后软删，delta 2 越过已失效的详情页直接回来源页 */
function onDelete() {
  if (deleting.value) return;
  uni.showModal({
    title: '删除这件衣物？',
    content: '穿搭记录会保留，衣物删除后不可恢复',
    success: async (res) => {
      if (!res.confirm || deleting.value) return;
      deleting.value = true;
      try {
        await deleteGarment(garmentId);
        useToast().success('已删除');
        uni.navigateBack({ delta: 2 });
      } catch {
        // 请求器已提示；失败留在本页可重试
        deleting.value = false;
      }
    },
  });
}

function goBack() {
  uni.navigateBack();
}

onLoad((query) => {
  garmentId = (query?.id as string) ?? '';
  if (!garmentId) {
    loading.value = false;
    return;
  }
  load();
});
</script>

<style lang="scss" scoped>
.edit {
  min-height: 100vh;
  padding: $zy-gap-lg;
  padding-bottom: 40px;
}
.state {
  padding-top: 160px;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}
.empty-t {
  font-size: 16px;
  font-weight: 600;
  color: $zy-ink;
}
.hero {
  position: relative;
  background: $zy-surface;
  border-radius: $zy-radius;
  padding: 20px;
  box-shadow: $zy-shadow-soft;
}
.hero__img {
  width: 100%;
  height: 480rpx;
  background: $zy-bg;
}
.hero__change {
  position: absolute;
  right: 14px;
  bottom: 14px;
  padding: 6px 14px;
  border-radius: $zy-radius-pill;
  background: rgba(28, 27, 25, 0.65);
  font-size: 12px;
  color: #fff;
}
.form {
  margin-top: 20px;
}
.actions {
  margin-top: 24px;
}
.danger {
  display: flex;
  justify-content: center;
  margin-top: 28px;
  padding: 10px;
}
.danger__t {
  font-size: 13px;
  color: $zy-danger;
}
</style>
