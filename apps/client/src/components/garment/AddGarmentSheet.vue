<script setup lang="ts">
/**
 * AddGarmentSheet：录入弹层。
 *
 * 三条路径共用同一确认表单与入库出口（PRD 4.1 录入生命线）：
 * - 拍照/选图（单张）→ AI 识别属性 → 确认页
 * - 拍照/选图（多张）→ 批次流水线，识别后台跑 → 速览列表一起入橱
 * - 购物截图导入 → 多张截图提取名称/品牌/价格（拍照拿不到的数据）
 * 单张与多张共用一个入口，选完按张数自动分流，不新增入口（简约克制）。
 * 对外接口：v-model:show 控制显隐，@created 通知父级刷新。
 */
import { ref, watch } from 'vue';
import AppSheet from '../base/AppSheet.vue';
import AppButton from '../base/AppButton.vue';
import AppLoading from '../base/AppLoading.vue';
import RecognitionForm, { type GarmentDraft } from './RecognitionForm.vue';
import BatchReviewSheet from './BatchReviewSheet.vue';
import { useUpload } from '../../composables/useUpload';
import { useRecognition } from '../../composables/useRecognition';
import { useCutout } from '../../composables/useCutout';
import { useScreenshotExtract } from '../../composables/useScreenshotExtract';
import { useBatchQueue, MAX_BATCH_SIZE } from '../../composables/useBatchQueue';
import { useToast } from '../../composables/useToast';
import { hasPendingItems } from '../../utils/batch-queue-storage';
import { createGarment } from '../../api/garment.api';

const props = defineProps<{
  show: boolean;
  /** 衣橱现有件数，用于批次完成的成就文案 */
  closetCount?: number;
}>();
const emit = defineEmits<{ (e: 'update:show', v: boolean): void; (e: 'created'): void }>();

const { uploading, chooseOnly, uploadOne, chooseAndUploadMany } = useUpload();
const { recognizing, recognizingHint, recognize, lowConfidence } = useRecognition();
const { cutting, cutout } = useCutout();
const {
  extracting,
  extractingHint,
  extract,
  lowConfidence: extractLowConfidence,
} = useScreenshotExtract();
const batch = useBatchQueue();

const imageUrl = ref<string | null>(null);
/** 拍照分支抠图去背景后的白底主图；截图分支恒 null。预览与主图优先用它 */
const cutoutImageUrl = ref<string | null>(null);
const form = ref<GarmentDraft | null>(null);
const saving = ref(false);
/** 本次是否走截图导入：决定失败文案与入库时的待补实物图标记 */
const fromScreenshot = ref(false);
/** 识别/提取结果提示条：failed=没读出来（先存后补），low=低置信度建议核对 */
const recognitionNotice = ref<'' | 'failed' | 'low'>('');
/** 是否处于批次视图 */
const showBatch = ref(false);
/** 批次入橱进行中：入库是这里的异步过程，交给列表禁用按钮防连点重复创建 */
const batchSaving = ref(false);

// 打开弹层时恢复上次未入橱的批次：录入是主动行为，不在 app 冷启时打断用户
watch(
  () => props.show,
  (open) => {
    if (!open) return;
    batch.restore();
    if (hasPendingItems(batch.items.value)) {
      showBatch.value = true;
      useToast().info(`上次还有 ${batch.items.value.length} 件没入橱`);
    }
  },
);

/** 入口一：选图后按张数分流——单张走原流程，多张走批次流水线 */
async function pickAndRecognize() {
  const paths = await chooseOnly(MAX_BATCH_SIZE);
  if (!paths.length) return;
  if (paths.length > 1) {
    showBatch.value = true;
    await batch.addPaths(paths);
    return;
  }
  const up = await uploadOne(paths[0]);
  if (!up) return;
  fromScreenshot.value = false;
  imageUrl.value = up.imageUrl;
  cutoutImageUrl.value = null;
  // 识别（读属性）与抠图（去背景）正交，前端并行、互不阻塞；两者失败都不阻断录入
  const [rec, cut] = await Promise.all([
    recognize(up.imageUrl),
    cutout(up.imageUrl),
  ]);
  form.value = rec; // 失败返回 null → 先存图后补
  cutoutImageUrl.value = cut; // 抠出白底则确认页预览换它，null 回退原图
  recognitionNotice.value =
    rec === null ? 'failed' : lowConfidence.value ? 'low' : '';
}

/** 批次「继续拍」：追加到现有队列，不清空已有项 */
async function continueShoot() {
  const remain = MAX_BATCH_SIZE - batch.items.value.length;
  if (remain <= 0) {
    useToast().info(`单批最多 ${MAX_BATCH_SIZE} 件，先入橱再继续`);
    return;
  }
  const paths = await chooseOnly(remain);
  if (paths.length) await batch.addPaths(paths);
}

/** 批次入橱：全部成功才收尾，有残留则留在列表让用户处理 */
async function saveBatch() {
  if (batchSaving.value) return;
  batchSaving.value = true;
  let saved = 0;
  try {
    saved = await batch.saveAll();
  } finally {
    batchSaving.value = false;
  }
  if (!saved) return;
  emit('created');
  if (hasPendingItems(batch.items.value)) {
    // 还有识别中或入库失败的项：留在列表继续处理，但先确认这批已经进去了
    useToast().success(`已入橱 ${saved} 件，剩下的可稍后再入`);
    return;
  }
  // 首页入口拿不到衣橱总数，此时只报本次件数，不显示错误的总数
  useToast().success(
    props.closetCount != null
      ? `本次上线 ${saved} 件，衣橱已有 ${props.closetCount + saved} 件`
      : `本次上线 ${saved} 件`,
  );
  showBatch.value = false;
}

/** 入口二：选购物截图（1~3 张）直传后合并提取，预填名称/品牌/价格 */
async function pickScreenshotsAndExtract() {
  const urls = await chooseAndUploadMany(3);
  if (!urls) return;
  fromScreenshot.value = true;
  cutoutImageUrl.value = null; // 截图分支不抠图，主图用截图/cropped 本身
  // 主图先用第一张截图顶着（先囫囵存进去），详情页引导之后补实物图
  imageUrl.value = urls[0];
  const extracted = await extract(urls);
  // 服务端裁出了干净商品图则替换主图（仍非实物图，pendingPhoto 语义不变）
  if (extracted?.croppedImageUrl) {
    imageUrl.value = extracted.croppedImageUrl;
  }
  const result = extracted?.result;
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
      ...(cutoutImageUrl.value ? { cutoutImageUrl: cutoutImageUrl.value } : {}),
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
  cutoutImageUrl.value = null;
  form.value = null;
  fromScreenshot.value = false;
  recognitionNotice.value = '';
}
function close() {
  emit('update:show', false);
}
</script>

<template>
  <!-- 批次视图：多张录入的速览确认 -->
  <BatchReviewSheet
    v-if="showBatch"
    :show="show"
    :items="batch.items.value"
    :uploading="batch.uploading.value"
    :saving="batchSaving"
    :closet-count="closetCount ?? 0"
    @update:show="showBatch = false; close()"
    @continue-shoot="continueShoot"
    @update-draft="batch.updateDraft"
    @remove="batch.removeItem"
    @retry="batch.retryItem"
    @save-all="saveBatch"
  />

  <AppSheet v-else :model-value="show" title="添加衣物" subtitle="拍照或选图，自动识别品类、颜色、材质" @update:model-value="close">
    <!-- 未选图：两个并列入口 -->
    <view v-if="!imageUrl">
      <view class="dz" @click="pickAndRecognize">
        <text class="dz__t">拍照 / 从相册选择</text>
        <text class="dz__s">平铺或挂拍、背景干净，自动抠图去背景 + 识别；可多选连拍</text>
      </view>
      <view class="dz dz--alt" @click="pickScreenshotsAndExtract">
        <text class="dz__t">从购物截图导入</text>
        <text class="dz__s">选订单/商品页截图（最多 3 张），自动填名称、品牌、价格</text>
      </view>
    </view>

    <!-- 上传/识别/抠图/提取中 -->
    <AppLoading
      v-else-if="uploading || recognizing || cutting || extracting"
      :text="uploading ? '上传中…' : extracting ? extractingHint : recognizingHint"
    />

    <!-- 识别/提取完成：确认表单 -->
    <view v-else>
      <image class="preview" :src="cutoutImageUrl || imageUrl" mode="aspectFit" />
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
