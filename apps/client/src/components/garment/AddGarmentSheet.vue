<script setup lang="ts">
/**
 * AddGarmentSheet：录入弹层。
 * 两条入口共用同一确认表单与入库出口（PRD 4.1 录入生命线）：
 * - 拍照/选图 → AI 识别属性
 * - 购物截图导入 → 多张截图提取名称/品牌/价格（拍照拿不到的数据）
 * 对外接口：v-model:show 控制显隐，@created 通知父级刷新。
 */
import { ref } from 'vue';
import AppSheet from '../base/AppSheet.vue';
import AppButton from '../base/AppButton.vue';
import AppLoading from '../base/AppLoading.vue';
import RecognitionForm, { type GarmentDraft } from './RecognitionForm.vue';
import { useUpload } from '../../composables/useUpload';
import { useRecognition } from '../../composables/useRecognition';
import { useScreenshotExtract } from '../../composables/useScreenshotExtract';
import { createGarment } from '../../api/garment.api';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ (e: 'update:show', v: boolean): void; (e: 'created'): void }>();

const { uploading, chooseAndUpload, chooseAndUploadMany } = useUpload();
const { recognizing, recognizingHint, recognize, lowConfidence } = useRecognition();
const {
  extracting,
  extractingHint,
  extract,
  lowConfidence: extractLowConfidence,
} = useScreenshotExtract();

const imageUrl = ref<string | null>(null);
const form = ref<GarmentDraft | null>(null);
const saving = ref(false);
/** 本次是否走截图导入：决定失败文案与入库时的待补实物图标记 */
const fromScreenshot = ref(false);
/** 识别/提取结果提示条：failed=没读出来（先存后补），low=低置信度建议核对 */
const recognitionNotice = ref<'' | 'failed' | 'low'>('');

/** 入口一：选图并直传，成功后自动触发识别 */
async function pickAndRecognize() {
  const up = await chooseAndUpload();
  if (!up) return;
  fromScreenshot.value = false;
  imageUrl.value = up.imageUrl;
  form.value = await recognize(up.imageUrl); // 失败返回 null → 先存图后补
  recognitionNotice.value =
    form.value === null ? 'failed' : lowConfidence.value ? 'low' : '';
}

/** 入口二：选购物截图（1~3 张）直传后合并提取，预填名称/品牌/价格 */
async function pickScreenshotsAndExtract() {
  const urls = await chooseAndUploadMany(3);
  if (!urls) return;
  fromScreenshot.value = true;
  // 主图先用第一张截图顶着（先囫囵存进去），详情页引导之后补实物图
  imageUrl.value = urls[0];
  const result = await extract(urls);
  form.value = result
    ? {
        // 读不到的字段为 null：转 undefined 留空，让用户自填而非提交空串
        name: result.name ?? undefined,
        brand: result.brand ?? undefined,
        price: result.price != null ? Math.round(result.price) : undefined,
        mainColor: result.mainColor ?? undefined,
        category: result.categoryGuess ?? undefined,
      }
    : null;
  recognitionNotice.value =
    form.value === null ? 'failed' : extractLowConfidence.value ? 'low' : '';
}

/** 确认入库；截图导入的衣物带待补实物图标记，详情页据此展示引导 */
async function save() {
  if (!imageUrl.value) return;
  saving.value = true;
  try {
    await createGarment({
      originalImageUrl: imageUrl.value,
      ...(form.value ?? {}),
      ...(fromScreenshot.value
        ? { extra: { source: 'screenshot', pendingPhoto: true } }
        : {}),
    });
    reset();
    emit('created');
  } finally {
    saving.value = false;
  }
}

function reset() {
  imageUrl.value = null;
  form.value = null;
  fromScreenshot.value = false;
  recognitionNotice.value = '';
}
function close() {
  emit('update:show', false);
}
</script>

<template>
  <AppSheet :model-value="show" title="添加衣物" subtitle="拍照或选图，自动识别品类、颜色、材质" @update:model-value="close">
    <!-- 未选图：两个并列入口 -->
    <view v-if="!imageUrl">
      <view class="dz" @click="pickAndRecognize">
        <text class="dz__t">拍照 / 从相册选择</text>
        <text class="dz__s">自动识别品类、颜色、材质</text>
      </view>
      <view class="dz dz--alt" @click="pickScreenshotsAndExtract">
        <text class="dz__t">从购物截图导入</text>
        <text class="dz__s">选订单/商品页截图（最多 3 张），自动填名称、品牌、价格</text>
      </view>
    </view>

    <!-- 上传/识别/提取中 -->
    <AppLoading
      v-else-if="uploading || recognizing || extracting"
      :text="uploading ? '上传中…' : extracting ? extractingHint : recognizingHint"
    />

    <!-- 识别/提取完成：确认表单 -->
    <view v-else>
      <image class="preview" :src="imageUrl" mode="aspectFit" />
      <view v-if="recognitionNotice" class="notice" :class="`notice--${recognitionNotice}`">
        <text>{{ recognitionNotice === 'failed'
          ? (fromScreenshot
            ? 'AI 没读出来，可以先存截图稍后补'
            : 'AI 没认出这件衣物，可以先保存图片，稍后再补充信息')
          : 'AI 对识别结果不太确定，建议核对后再保存' }}</text>
      </view>
      <RecognitionForm v-model="form" />
      <view class="actions">
        <AppButton type="secondary" @click="reset">重选</AppButton>
        <AppButton :loading="saving" block @click="save">确认添加</AppButton>
      </view>
    </view>
  </AppSheet>
</template>

<style lang="scss" scoped>
.dz { display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 60rpx; border: 2rpx dashed $zy-line; border-radius: $zy-radius-sm; background: $zy-surface; }
.dz--alt { margin-top: 20rpx; padding: 40rpx 60rpx; }
.dz__t { font-size: 28rpx; font-weight: 600; color: $zy-ink; }
.dz__s { margin-top: 8rpx; font-size: 24rpx; color: $zy-ink-2; text-align: center; }
.preview { width: 100%; height: 360rpx; border-radius: $zy-radius-sm; background: $zy-bg; }
.notice { margin-top: 16rpx; padding: 16rpx 20rpx; border-radius: $zy-radius-sm; font-size: 24rpx; line-height: 1.5; }
.notice--failed { background: rgba(230, 162, 60, 0.1); color: #b8863b; }
.notice--low { background: rgba(64, 128, 255, 0.08); color: #4a6fa5; }
.actions { display: flex; gap: 16rpx; margin-top: 24rpx; }
</style>
