<template>
  <view class="settings">
    <!-- 衣柜名称 -->
    <view class="panel">
      <text class="panel__title">衣柜名称</text>
      <view class="namerow">
        <input
          class="namerow__input"
          v-model="closetNameDraft"
          :maxlength="16"
          placeholder="给衣柜起个名"
        />
        <view class="btn" :class="{ 'btn--dis': savingName }" @click="saveName">
          <text>保存</text>
        </view>
      </view>
      <text class="hint">显示在首页左上角，最多 16 个字。</text>
    </view>

    <!-- 服装 / 配饰分类 -->
    <view v-for="group in groups" :key="group.majorType" class="panel">
      <text class="panel__title">{{ group.majorType }}分类</text>
      <view class="cats">
        <view v-for="c in group.items" :key="c.id" class="cat">
          <text class="cat__name">{{ c.name }}</text>
          <!-- 「其他」是 AI 识别与删除重指派的兜底归属，不提供删除入口 -->
          <text
            v-if="c.name !== FALLBACK_CATEGORY"
            class="cat__x"
            @click="confirmRemove(c)"
          >
            ×
          </text>
        </view>
      </view>
      <view class="addrow">
        <input
          class="addrow__input"
          v-model="group.draft.value"
          :maxlength="6"
          :placeholder="`新${group.majorType}分类（1~6 字）`"
        />
        <view class="btn btn--ghost" @click="addCategory(group.majorType)">
          <text>添加</text>
        </view>
      </view>
    </view>

    <!-- 全身照 -->
    <view class="panel">
      <text class="panel__title">试穿全身照</text>
      <view v-if="bodyPhotoUrl" class="body">
        <image class="body__img" :src="bodyPhotoUrl" mode="aspectFill" />
        <view class="body__side">
          <text class="hint">仅用于生成试穿效果，不会展示给他人。</text>
          <view class="btn btn--danger" @click="confirmRemoveBodyPhoto">
            <text>删除全身照</text>
          </view>
        </view>
      </view>
      <text v-else class="hint">未上传。在智能搭配页试穿时可上传。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 设置页：衣柜名 / 分类管理 / 全身照删除。
 *
 * 分类是用户级数据（后端 categories 表），此页是唯一的增删入口；
 * 增删成功后使分类缓存失效，录入表单与衣橱筛选下次读取即回源。
 */
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import type { MajorType } from '@zhiyi/shared';
import {
  listCategories,
  createCategory,
  getCategoryUsage,
  deleteCategory,
  invalidateCategoryCache,
  type CategoryRecord,
} from '../../api/category.api';
import { updateClosetName } from '../../api/user.api';
import { removeBodyPhoto } from '../../api/tryon.api';
import { useUserStore } from '../../store/user';

/** AI 识别与删除重指派的兜底分类，后端禁删，前端不出删除入口 */
const FALLBACK_CATEGORY = '其他';

const userStore = useUserStore();

const closetNameDraft = ref('');
const savingName = ref(false);

const categories = ref<CategoryRecord[]>([]);
/** 两组添加输入框各自的草稿 */
const clothingDraft = ref('');
const accessoryDraft = ref('');

/** 按大类分组渲染（模板里 v-for 一次画两块 panel） */
const groups = computed(() => [
  {
    majorType: '服装' as MajorType,
    items: categories.value.filter((c) => c.majorType === '服装'),
    draft: clothingDraft,
  },
  {
    majorType: '配饰' as MajorType,
    items: categories.value.filter((c) => c.majorType === '配饰'),
    draft: accessoryDraft,
  },
]);

const bodyPhotoUrl = computed(() => userStore.user?.bodyPhotoUrl ?? null);

// onShow 而非 onMounted：从搭配页上传全身照后返回，此页需反映最新状态
onShow(async () => {
  await userStore.ensureLogin();
  closetNameDraft.value = userStore.user?.closetName ?? '';
  try {
    categories.value = await listCategories();
  } catch {
    // 错误提示已由请求器统一处理
  }
});

/** 保存衣柜名：后端只回新名字，合并进 store（不整体覆盖 user），首页立即生效 */
async function saveName() {
  const name = closetNameDraft.value.trim();
  if (!name) {
    uni.showToast({ title: '衣柜名不能为空', icon: 'none' });
    return;
  }
  if (savingName.value) return;
  savingName.value = true;
  try {
    const { closetName } = await updateClosetName(name);
    if (userStore.user) {
      userStore.user = { ...userStore.user, closetName };
    }
    uni.showToast({ title: '已保存', icon: 'success' });
  } catch {
    // 请求器已提示
  } finally {
    savingName.value = false;
  }
}

/** 添加分类：长度/重名由后端把关（请求器统一 toast），前端只拦空值 */
async function addCategory(majorType: MajorType) {
  const draft = majorType === '服装' ? clothingDraft : accessoryDraft;
  const name = draft.value.trim();
  if (!name) {
    uni.showToast({ title: '请输入分类名', icon: 'none' });
    return;
  }
  try {
    const created = await createCategory(name, majorType);
    categories.value = [...categories.value, created];
    draft.value = '';
    invalidateCategoryCache();
    uni.showToast({ title: '已添加', icon: 'success' });
  } catch {
    // 请求器已提示（重名 409 / 超长 400）
  }
}

/** 删除分类：先查在用件数，明示影响后二次确认（PRD 要求） */
async function confirmRemove(cat: CategoryRecord) {
  let count = 0;
  try {
    count = (await getCategoryUsage(cat.id)).count;
  } catch {
    return; // 查不到影响面就不冒进删除
  }
  const content =
    count > 0
      ? `「${cat.name}」下有 ${count} 件衣物，删除后将归入「${FALLBACK_CATEGORY}」`
      : `确定删除分类「${cat.name}」吗？`;
  uni.showModal({
    title: '删除分类',
    content,
    confirmText: '删除',
    confirmColor: '#c0392b',
    success: async (res) => {
      if (!res.confirm) return;
      try {
        await deleteCategory(cat.id);
        categories.value = categories.value.filter((c) => c.id !== cat.id);
        invalidateCategoryCache();
        uni.showToast({ title: '已删除', icon: 'success' });
      } catch {
        // 请求器已提示
      }
    },
  });
}

/** 删除全身照：二次确认后清除，试穿页自然回引导态 */
function confirmRemoveBodyPhoto() {
  uni.showModal({
    title: '删除全身照',
    content: '删除后试穿功能需要重新上传全身照',
    confirmText: '删除',
    confirmColor: '#c0392b',
    success: async (res) => {
      if (!res.confirm) return;
      try {
        await removeBodyPhoto();
        if (userStore.user) {
          userStore.user = { ...userStore.user, bodyPhotoUrl: null };
        }
        uni.showToast({ title: '已删除', icon: 'success' });
      } catch {
        // 请求器已提示
      }
    },
  });
}
</script>

<style lang="scss">
.settings {
  min-height: 100vh;
  background: $zy-bg;
  padding: 16px 20px 60px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.panel {
  background: $zy-surface;
  border: 1px solid $zy-line;
  border-radius: $zy-radius;
  padding: 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.panel__title {
  font-size: 15px;
  font-weight: 700;
  color: $zy-ink;
}
.hint {
  font-size: 12px;
  color: $zy-ink-3;
}
.namerow,
.addrow {
  display: flex;
  align-items: center;
  gap: 10px;
}
.namerow__input,
.addrow__input {
  flex: 1;
  height: 42px;
  padding: 0 14px;
  background: $zy-bg;
  border: 1px solid $zy-line;
  border-radius: $zy-radius-sm;
  font-size: 14px;
  color: $zy-ink;
}
.btn {
  flex: 0 0 auto;
  padding: 10px 18px;
  border-radius: $zy-radius-sm;
  background: $zy-accent;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}
.btn--dis {
  opacity: 0.6;
}
.btn--ghost {
  background: $zy-bg;
  color: $zy-ink-2;
  border: 1px solid $zy-line;
}
.btn--danger {
  background: #c0392b;
  align-self: flex-start;
}
.cats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.cat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  background: $zy-bg;
  border: 1px solid $zy-line;
  border-radius: $zy-radius-pill;
}
.cat__name {
  font-size: 13px;
  font-weight: 600;
  color: $zy-ink-2;
}
.cat__x {
  font-size: 16px;
  line-height: 1;
  color: $zy-ink-3;
  padding: 2px;
}
.body {
  display: flex;
  gap: 14px;
}
.body__img {
  width: 96px;
  height: 128px;
  border-radius: $zy-radius-sm;
  background: $zy-bg;
  flex: 0 0 auto;
}
.body__side {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
}
</style>
