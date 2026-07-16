<template>
  <view class="detail">
    <!-- 加载中 -->
    <view v-if="loading" class="state">
      <AppLoading text="加载中…" />
    </view>

    <!-- 加载失败 / 不存在 -->
    <view v-else-if="!garment" class="state empty">
      <text class="empty-t">衣物不存在或已删除</text>
      <AppButton type="secondary" @click="goBack">返回衣橱</AppButton>
    </view>

    <template v-else>
      <!-- 第一层：大图 + 三个体感数字 -->
      <view class="hero">
        <image
          class="hero__img"
          :src="garment.cutoutImageUrl || garment.originalImageUrl"
          mode="aspectFit"
        />
      </view>

      <view class="stats">
        <view class="stat">
          <text class="stat__num">{{ garment.wearCount }}</text>
          <text class="stat__label">累计穿着</text>
        </view>
        <view class="stat">
          <text class="stat__num">{{ costText }}</text>
          <text class="stat__label">单次成本</text>
        </view>
        <view class="stat">
          <text class="stat__num">{{ lastWornText }}</text>
          <text class="stat__label">上次穿</text>
        </view>
      </view>

      <!-- 名称 + 品类 + 闲置标记 -->
      <view class="title-row">
        <text class="title">{{ garment.name }}</text>
        <AppTag v-if="garment.archived" variant="dark">已闲置</AppTag>
      </view>
      <view class="chips">
        <AppTag>{{ garment.category }}</AppTag>
        <AppTag v-if="garment.mainColor">{{ garment.mainColor }}</AppTag>
        <AppTag v-for="s in garment.seasons" :key="s">{{ s }}</AppTag>
      </view>

      <!-- 第二层：基本档案 -->
      <view class="card">
        <text class="card__title">基本档案</text>
        <view class="field">
          <text class="field__k">材质</text>
          <text class="field__v">{{ garment.material || '—' }}</text>
        </view>
        <view class="field">
          <text class="field__k">厚薄</text>
          <text class="field__v">{{ garment.thickness }}</text>
        </view>
        <view class="field">
          <text class="field__k">正式度</text>
          <text class="field__v">{{ garment.formality }}</text>
        </view>
        <view class="field">
          <text class="field__k">适用季节</text>
          <text class="field__v">{{ garment.seasons.join('、') || '—' }}</text>
        </view>
        <view class="field">
          <text class="field__k">品牌</text>
          <text class="field__v">{{ garment.brand || '—' }}</text>
        </view>
        <view class="field">
          <text class="field__k">价格</text>
          <text class="field__v">{{ garment.price != null ? `¥${garment.price}` : '—' }}</text>
        </view>
        <!-- 风格标签（AI 的额外发现） -->
        <view v-if="garment.styleTags.length" class="field field--tags">
          <text class="field__k">风格</text>
          <view class="chips">
            <AppTag v-for="t in garment.styleTags" :key="t">{{ t }}</AppTag>
          </view>
        </view>
      </view>

      <!-- 第三层：操作（克制：记一次穿着 / 标记闲置） -->
      <view class="actions">
        <AppButton :loading="acting" block @click="onWear">记一次穿着</AppButton>
        <AppButton type="secondary" block @click="onToggleArchive">
          {{ garment.archived ? '取消闲置' : '标记闲置' }}
        </AppButton>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
/**
 * 衣物详情页（PRD 4.3 三层结构）：
 * 一眼看到（大图 + 累计穿着 / 单次成本 / 上次穿）→ 基本档案 → 操作。
 *
 * 操作克制到两个：记一次穿着（数据飞轮起点）、标记/取消闲置（断舍离清单）。
 * 「出现在这些搭配里」的社交关系待搭配/日记模块落地后补。
 */
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { costPerWear, type Garment } from '@zhiyi/shared';
import AppLoading from '../../components/base/AppLoading.vue';
import AppButton from '../../components/base/AppButton.vue';
import AppTag from '../../components/base/AppTag.vue';
import {
  detailGarment,
  recordWear,
  setArchived,
} from '../../api/garment.api';
import { useToast } from '../../composables/useToast';

const garment = ref<Garment | null>(null);
const loading = ref(true);
const acting = ref(false);
let garmentId = '';

/** 单次成本文案：无价格或没穿过时显示占位（不误导） */
const costText = computed(() => {
  if (!garment.value) return '—';
  const c = costPerWear(garment.value.price ?? undefined, garment.value.wearCount);
  return c == null ? '—' : `¥${c}`;
});

/** 上次穿文案：未穿过显示「未穿过」 */
const lastWornText = computed(() => {
  const d = garment.value?.lastWornAt;
  if (!d) return '未穿过';
  return formatDate(d);
});

/** 把 ISO 日期串格式化为「M月D日」 */
function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 加载详情；失败由请求器统一提示，这里兜底停 loading */
async function load() {
  loading.value = true;
  try {
    garment.value = await detailGarment(garmentId);
  } catch {
    garment.value = null;
  } finally {
    loading.value = false;
  }
}

/** 记一次穿着：乐观更新由后端返回值覆盖，保证数字准确 */
async function onWear() {
  if (acting.value) return;
  acting.value = true;
  try {
    garment.value = await recordWear(garmentId);
    useToast().success('已记录');
  } catch {
    // 请求器已提示
  } finally {
    acting.value = false;
  }
}

/** 切换闲置标记 */
async function onToggleArchive() {
  if (!garment.value || acting.value) return;
  acting.value = true;
  const next = !garment.value.archived;
  try {
    garment.value = await setArchived(garmentId, next);
    useToast().info(next ? '已标记闲置' : '已取消闲置');
  } catch {
    // 请求器已提示
  } finally {
    acting.value = false;
  }
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
.detail {
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
.stats {
  display: flex;
  margin-top: 16px;
  background: $zy-surface;
  border-radius: $zy-radius;
  padding: 20px 0;
  box-shadow: $zy-shadow-soft;
}
.stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.stat__num {
  font-size: 22px;
  font-weight: 700;
  color: $zy-ink;
}
.stat__label {
  font-size: 12px;
  color: $zy-ink-2;
}
.title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 24px;
}
.title {
  font-size: 20px;
  font-weight: 700;
  color: $zy-ink;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.card {
  margin-top: 20px;
  background: $zy-surface;
  border-radius: $zy-radius;
  padding: 20px;
  box-shadow: $zy-shadow-soft;
}
.card__title {
  font-size: 15px;
  font-weight: 700;
  color: $zy-ink;
  margin-bottom: 8px;
  display: block;
}
.field {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid $zy-line;
}
.field:last-child {
  border-bottom: none;
}
.field--tags {
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}
.field__k {
  font-size: 14px;
  color: $zy-ink-2;
}
.field__v {
  font-size: 14px;
  color: $zy-ink;
  font-weight: 600;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 24px;
}
</style>
