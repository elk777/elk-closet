<script setup lang="ts">
/**
 * BatchReviewSheet：连拍批次的速览确认列表。
 *
 * 录几十件衣服时逐张走确认页点击成本过高，改为一屏卡片速览：
 * 预填对的直接「全部入橱」，只点开有问题的那几件改（PRD R3/D2）。
 * 编辑复用 RecognitionForm，不另造确认 UI（父任务约束）。
 */
import { computed, ref } from 'vue';
import AppSheet from '../base/AppSheet.vue';
import AppButton from '../base/AppButton.vue';
import RecognitionForm, { type GarmentDraft } from './RecognitionForm.vue';
import type { BatchItem } from '../../utils/batch-queue-storage';

const props = defineProps<{
  show: boolean;
  items: BatchItem[];
  /** 上传进行中：拍摄阶段禁掉入橱，避免半批入库 */
  uploading: boolean;
  /** 入橱进行中：由父级持有（入库是父级的异步过程），防连点重复创建 */
  saving: boolean;
  /** 衣橱现有件数，用于批次完成的成就文案 */
  closetCount: number;
  /** 本批次被判为非衣物、已移出列表的张数；用于说明数量对不上的原因 */
  skippedCount?: number;
}>();

const emit = defineEmits<{
  (e: 'update:show', v: boolean): void;
  (e: 'continue-shoot'): void;
  (e: 'update-draft', id: string, draft: GarmentDraft): void;
  (e: 'remove', id: string): void;
  (e: 'retry', id: string): void;
  (e: 'save-all'): void;
}>();

/** 当前展开编辑的项 id；同时只展开一个，保持列表可扫视 */
const expandedId = ref<string | null>(null);

/** 本次可入橱的项：口径须与 useBatchQueue.saveAll 一致——已出结果且有图 */
const savableCount = computed(
  () =>
    props.items.filter(
      (it) => it.imageUrl && (it.status === 'ready' || it.status === 'failed'),
    ).length,
);
/** 仍在识别中的项数，用于底部提示 */
const processingCount = computed(
  () => props.items.filter((it) => it.status === 'processing').length,
);

/** 卡片主图：白底图优先，其次远端原图，上传阶段用本地临时路径顶着 */
function thumbOf(item: BatchItem): string {
  return item.cutoutImageUrl || item.imageUrl || item.localPath;
}

/** 卡片摘要：识别到什么就显示什么，没识别出来给出「先存后补」的语义 */
function summaryOf(item: BatchItem): string {
  if (item.status === 'uploading') return '上传中…';
  if (item.status === 'processing') return 'AI 识别中…';
  if (!item.imageUrl) return '图片上传失败';
  if (!item.draft) return '没认出来，可先入橱稍后补';
  const { name, category, mainColor } = item.draft;
  const parts = [name, category, mainColor].filter(Boolean);
  return parts.length ? parts.join(' · ') : '待补充信息';
}

/** 状态徽标文案；ready 且低置信度时提示核对 */
function badgeOf(item: BatchItem): { text: string; kind: string } | null {
  if (item.status === 'failed') {
    return item.imageUrl
      ? { text: '待补', kind: 'warn' }
      : { text: '失败', kind: 'error' };
  }
  if (item.status === 'ready' && item.lowConfidence) {
    return { text: '建议核对', kind: 'info' };
  }
  if (item.status === 'saved') return { text: '已入橱', kind: 'done' };
  return null;
}

function toggle(id: string) {
  expandedId.value = expandedId.value === id ? null : id;
}
</script>

<template>
  <AppSheet
    :model-value="show"
    title="批量录入"
    :subtitle="`${items.length} 件待确认，扫一眼没问题就一起入橱`"
    @update:model-value="emit('update:show', false)"
  >
    <view class="bq">
      <!-- 非衣物图已被移出队列，此处说明数量差异，避免用户以为丢图 -->
      <view v-if="skippedCount" class="bq-skipped">
        <text>已跳过 {{ skippedCount }} 张没识别到衣物的图</text>
      </view>

      <!-- 卡片列表 -->
      <view v-for="item in items" :key="item.id" class="bq-card">
        <view class="bq-card__row" @click="toggle(item.id)">
          <image class="bq-card__img" :src="thumbOf(item)" mode="aspectFill" />
          <view class="bq-card__main">
            <text class="bq-card__sum">{{ summaryOf(item) }}</text>
            <view v-if="badgeOf(item)" class="bq-badge" :class="`bq-badge--${badgeOf(item)!.kind}`">
              <text>{{ badgeOf(item)!.text }}</text>
            </view>
          </view>
          <text class="bq-card__caret">{{ expandedId === item.id ? '收起' : '展开' }}</text>
        </view>

        <!-- 展开：复用识别确认表单 -->
        <view v-if="expandedId === item.id" class="bq-card__edit">
          <RecognitionForm
            :model-value="item.draft"
            @update:model-value="emit('update-draft', item.id, $event)"
          />
          <view class="bq-card__ops">
            <AppButton
              v-if="item.status === 'failed' && item.imageUrl"
              type="secondary"
              @click="emit('retry', item.id)"
            >
              重试识别
            </AppButton>
            <AppButton type="ghost" @click="emit('remove', item.id)">移除这件</AppButton>
          </view>
        </view>
      </view>

      <!-- 底部操作 -->
      <view class="bq-foot">
        <text v-if="processingCount" class="bq-foot__hint">
          还有 {{ processingCount }} 件在识别，识别完再一起入橱；可以先继续拍
        </text>
        <view class="bq-foot__btns">
          <AppButton type="secondary" :disabled="uploading" @click="emit('continue-shoot')">
            继续拍
          </AppButton>
          <AppButton
            block
            :loading="saving"
            :disabled="uploading || saving || !savableCount"
            @click="emit('save-all')"
          >
            全部入橱（{{ savableCount }}）
          </AppButton>
        </view>
      </view>
    </view>
  </AppSheet>
</template>

<style lang="scss" scoped>
.bq { display: flex; flex-direction: column; gap: 16rpx; }
.bq-skipped { padding: 16rpx 20rpx; border-radius: $zy-radius-sm; background: rgba(230, 162, 60, 0.1); font-size: 24rpx; line-height: 1.5; color: #b8863b; }
.bq-card { border: 2rpx solid $zy-line; border-radius: $zy-radius-sm; background: $zy-surface; overflow: hidden; }
.bq-card__row { display: flex; align-items: center; gap: 20rpx; padding: 20rpx; }
.bq-card__img { width: 100rpx; height: 100rpx; border-radius: $zy-radius-sm; background: $zy-bg; flex-shrink: 0; }
.bq-card__main { flex: 1; display: flex; flex-direction: column; gap: 8rpx; }
.bq-card__sum { font-size: 26rpx; color: $zy-ink; }
.bq-card__caret { font-size: 24rpx; color: $zy-ink-2; }
.bq-card__edit { padding: 0 20rpx 20rpx; border-top: 2rpx solid $zy-line; }
.bq-card__ops { display: flex; gap: 16rpx; margin-top: 24rpx; }
.bq-badge { align-self: flex-start; padding: 4rpx 12rpx; border-radius: $zy-radius-pill; font-size: 20rpx; }
.bq-badge--warn { background: rgba(230, 162, 60, 0.1); color: #b8863b; }
.bq-badge--error { background: rgba(220, 80, 80, 0.1); color: #c05050; }
.bq-badge--info { background: rgba(64, 128, 255, 0.08); color: #4a6fa5; }
.bq-badge--done { background: rgba(80, 180, 120, 0.1); color: #4a9968; }
.bq-foot { margin-top: 8rpx; }
.bq-foot__hint { display: block; margin-bottom: 12rpx; font-size: 24rpx; color: $zy-ink-2; text-align: center; }
.bq-foot__btns { display: flex; gap: 16rpx; }
</style>
