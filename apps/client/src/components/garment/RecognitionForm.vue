<script setup lang="ts">
/**
 * RecognitionForm：识别结果确认表单。
 *
 * 展示 AI 识别的属性并允许用户逐项修改（PRD 4.1 「扫一眼、点确认」）。
 * modelValue 为 null 表示识别失败，走「先存图后补」——此时字段全空，用户可手动补。
 * 品类选项来自用户分类表（设置页可增删），其余枚举仍来自 @zhiyi/shared 白名单。
 */
import { computed, onMounted, ref } from 'vue';
import {
  CATEGORIES,
  SEASONS,
  THICKNESS,
  FORMALITY,
  majorTypeOf,
  type MajorType,
  type RecognitionResult,
} from '@zhiyi/shared';
import { fetchCategoriesCached } from '../../api/category.api';
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

/** 品类改变时联动大类，保证两者一致（自定义分类的归属只有用户分类表知道） */
function onCategory(cat: string) {
  emit('update:modelValue', {
    ...form.value,
    category: cat,
    majorType: majorTypeOf(cat, categoryMajorTypes.value),
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

/** 品类选项：用户分类表为准，拉到前先用内置模板占位避免闪空 */
const categories = ref<readonly string[]>(CATEGORIES);
/** 品类名 → 大类 映射，供 majorTypeOf 判断自定义分类的归属 */
const categoryMajorTypes = ref<ReadonlyMap<string, MajorType>>(new Map());

/** 服装/配饰分组渲染：与衣橱筛选、设置页保持同一分组心智 */
const clothingCategories = computed(() =>
  categories.value.filter(
    (c) => majorTypeOf(c, categoryMajorTypes.value) === '服装',
  ),
);
const accessoryCategories = computed(() =>
  categories.value.filter(
    (c) => majorTypeOf(c, categoryMajorTypes.value) === '配饰',
  ),
);

// 录入弹层打开时已登录，直接拉取（内存缓存，重复打开不重复请求）
onMounted(async () => {
  const list = await fetchCategoriesCached();
  categories.value = list.map((c) => c.name);
  categoryMajorTypes.value = new Map(list.map((c) => [c.name, c.majorType]));
});

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

    <!-- 品类：按服装/配饰分组展示，与衣橱筛选、设置页同一心智；
         混排一片 14+ 个 chip 时配饰淹没在服装里不好找 -->
    <view class="rf-field">
      <text class="rf-label">品类 · 服装</text>
      <view class="rf-chips">
        <view
          v-for="c in clothingCategories"
          :key="c"
          class="rf-chip"
          :class="{ 'rf-chip--on': form.category === c }"
          @click="onCategory(c)"
        >
          {{ c }}
        </view>
      </view>
    </view>
    <view class="rf-field">
      <text class="rf-label">品类 · 配饰</text>
      <view class="rf-chips">
        <view
          v-for="c in accessoryCategories"
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
