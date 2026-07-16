<script setup lang="ts">
/**
 * RecognitionForm：识别结果确认表单。
 *
 * 展示 AI 识别的属性并允许用户逐项修改（PRD 4.1 「扫一眼、点确认」）。
 * modelValue 为 null 表示识别失败，走「先存图后补」——此时字段全空，用户可手动补。
 * 枚举选项全部来自 @zhiyi/shared 白名单（单一事实来源）。
 */
import { computed } from 'vue';
import {
  CATEGORIES,
  SEASONS,
  THICKNESS,
  FORMALITY,
  majorTypeOf,
  type Category,
  type RecognitionResult,
} from '@zhiyi/shared';
import AppTag from '../base/AppTag.vue';

/**
 * 录入草稿：AI 识别属性 + 用户手填的名称。
 * name 属于衣物属性而非识别契约（AI 不产出名称），故在草稿层并入，
 * 供确认表单编辑、最终随 createGarment 一并入库。
 */
export type GarmentDraft = Partial<RecognitionResult> & { name?: string };

interface Props {
  /** 识别结果草稿；为 null 表示识别失败，字段留空待用户手动补 */
  modelValue: GarmentDraft | null;
}
const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', value: GarmentDraft): void;
}>();

/** 当前表单值（modelValue 为 null 时用空对象兜底） */
const form = computed<GarmentDraft>(() => props.modelValue ?? {});

/** 更新单个字段并同步 v-model */
function patch(key: keyof GarmentDraft, value: unknown) {
  emit('update:modelValue', { ...form.value, [key]: value });
}

/** 品类改变时联动大类，保证两者一致 */
function onCategory(cat: Category) {
  emit('update:modelValue', {
    ...form.value,
    category: cat,
    majorType: majorTypeOf(cat),
  });
}

/** 季节多选：点击切换 */
function toggleSeason(s: string) {
  const cur = form.value.seasons ?? [];
  const next = cur.includes(s as never)
    ? cur.filter((x) => x !== s)
    : [...cur, s as never];
  patch('seasons', next);
}

const categories = CATEGORIES;
const seasons = SEASONS;
const thicknesses = THICKNESS;
const formalities = FORMALITY;
</script>

<template>
  <view class="rf">
    <!-- 名称 -->
    <view class="rf-field">
      <text class="rf-label">名称</text>
      <input
        class="rf-input"
        :value="form.name ?? ''"
        placeholder="给这件衣物起个名"
        @input="patch('name', ($event.target as HTMLInputElement).value)"
      />
    </view>

    <!-- 品类 -->
    <view class="rf-field">
      <text class="rf-label">品类</text>
      <view class="rf-chips">
        <view
          v-for="c in categories"
          :key="c"
          class="rf-chip"
          :class="{ 'rf-chip--on': form.category === c }"
          @click="onCategory(c)"
        >
          {{ c }}
        </view>
      </view>
    </view>

    <!-- 主色 + 材质 -->
    <view class="rf-field">
      <text class="rf-label">主色</text>
      <input
        class="rf-input"
        :value="form.mainColor ?? ''"
        placeholder="如 米白"
        @input="patch('mainColor', ($event.target as HTMLInputElement).value)"
      />
    </view>
    <view class="rf-field">
      <text class="rf-label">材质</text>
      <input
        class="rf-input"
        :value="form.material ?? ''"
        placeholder="如 羊毛混纺"
        @input="patch('material', ($event.target as HTMLInputElement).value)"
      />
    </view>

    <!-- 厚薄 -->
    <view class="rf-field">
      <text class="rf-label">厚薄</text>
      <view class="rf-chips">
        <view
          v-for="t in thicknesses"
          :key="t"
          class="rf-chip"
          :class="{ 'rf-chip--on': form.thickness === t }"
          @click="patch('thickness', t)"
        >
          {{ t }}
        </view>
      </view>
    </view>

    <!-- 季节多选 -->
    <view class="rf-field">
      <text class="rf-label">季节</text>
      <view class="rf-chips">
        <view
          v-for="s in seasons"
          :key="s"
          class="rf-chip"
          :class="{ 'rf-chip--on': (form.seasons ?? []).includes(s as never) }"
          @click="toggleSeason(s)"
        >
          {{ s }}
        </view>
      </view>
    </view>

    <!-- 正式度 -->
    <view class="rf-field">
      <text class="rf-label">正式度</text>
      <view class="rf-chips">
        <view
          v-for="f in formalities"
          :key="f"
          class="rf-chip"
          :class="{ 'rf-chip--on': form.formality === f }"
          @click="patch('formality', f)"
        >
          {{ f }}
        </view>
      </view>
    </view>

    <!-- 风格标签（只读展示 AI 的发现） -->
    <view v-if="(form.styleTags ?? []).length" class="rf-field">
      <text class="rf-label">风格</text>
      <view class="rf-chips">
        <AppTag v-for="tag in form.styleTags" :key="tag">{{ tag }}</AppTag>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.rf {
  display: flex;
  flex-direction: column;
  gap: $zy-gap;
}
.rf-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rf-label {
  font-size: 13px;
  font-weight: 600;
  color: $zy-ink-2;
}
.rf-input {
  height: 44px;
  padding: 0 14px;
  background: $zy-surface;
  border: 1px solid $zy-line;
  border-radius: $zy-radius-sm;
  font-size: 15px;
  color: $zy-ink;
}
.rf-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.rf-chip {
  padding: 8px 14px;
  background: $zy-surface;
  border: 1px solid $zy-line;
  border-radius: $zy-radius-pill;
  font-size: 13px;
  font-weight: 600;
  color: $zy-ink-2;
}
.rf-chip--on {
  background: $zy-accent;
  color: #fff;
  border-color: $zy-accent;
}
</style>
