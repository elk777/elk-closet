<script setup lang="ts">
/**
 * AddGarmentSheet：录入弹层。
 * 串起选图→直传又拍云→AI识别→结果确认(可改)→入库全链路。
 * 对外接口：v-model:show 控制显隐，@created 通知父级刷新。
 */
import { ref } from 'vue';
import AppSheet from '../base/AppSheet.vue';
import AppButton from '../base/AppButton.vue';
import AppLoading from '../base/AppLoading.vue';
import RecognitionForm, { type GarmentDraft } from './RecognitionForm.vue';
import { useUpload } from '../../composables/useUpload';
import { useRecognition } from '../../composables/useRecognition';
import { createGarment } from '../../api/garment.api';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ (e: 'update:show', v: boolean): void; (e: 'created'): void }>();

const { uploading, chooseAndUpload } = useUpload();
const { recognizing, recognize } = useRecognition();

const imageUrl = ref<string | null>(null);
const form = ref<GarmentDraft | null>(null);
const saving = ref(false);

/** 第一步：选图并直传，成功后自动触发识别 */
async function pickAndRecognize() {
  const up = await chooseAndUpload();
  if (!up) return;
  imageUrl.value = up.imageUrl;
  form.value = await recognize(up.imageUrl); // 失败返回 null → 先存图后补
}

/** 第二步：确认入库 */
async function save() {
  if (!imageUrl.value) return;
  saving.value = true;
  try {
    await createGarment({ originalImageUrl: imageUrl.value, ...(form.value ?? {}) });
    reset();
    emit('created');
  } finally {
    saving.value = false;
  }
}

function reset() {
  imageUrl.value = null;
  form.value = null;
}
function close() {
  emit('update:show', false);
}
</script>

<template>
  <AppSheet :model-value="show" title="添加衣物" subtitle="拍照或选图，自动识别品类、颜色、材质" @update:model-value="close">
    <!-- 未选图：上传引导 -->
    <view v-if="!imageUrl" class="dz" @click="pickAndRecognize">
      <text class="dz__t">拍照 / 从相册选择</text>
      <text class="dz__s">自动识别品类、颜色、材质</text>
    </view>

    <!-- 上传/识别中 -->
    <AppLoading v-else-if="uploading || recognizing" :text="uploading ? '上传中…' : 'AI 识别中…'" />

    <!-- 识别完成：确认表单 -->
    <view v-else>
      <image class="preview" :src="imageUrl" mode="aspectFit" />
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
.dz__t { font-size: 28rpx; font-weight: 600; color: $zy-ink; }
.dz__s { margin-top: 8rpx; font-size: 24rpx; color: $zy-ink-2; }
.preview { width: 100%; height: 360rpx; border-radius: $zy-radius-sm; background: $zy-bg; }
.actions { display: flex; gap: 16rpx; margin-top: 24rpx; }
</style>
