<template>
  <view class="checkin">
    <!-- 打卡美照：未选图出上传引导，选好后出预览可重选 -->
    <view class="photo">
      <view v-if="!photoUrl" class="photo__dz" @click="pickPhoto">
        <text class="photo__dz-t">拍照 / 从相册选择</text>
        <text class="photo__dz-s">记录今天这一套</text>
      </view>
      <view v-else class="photo__box">
        <image class="photo__img" :src="photoUrl" mode="aspectFill" />
        <view class="photo__reset" @click="pickPhoto">
          <text>重选</text>
        </view>
      </view>
    </view>

    <!-- 上传中 -->
    <view v-if="uploading" class="hint">
      <AppLoading text="上传中…" />
    </view>

    <!-- 单品选择：预猜命中默认勾选，可增减 -->
    <template v-else-if="photoUrl">
      <view class="section">
        <view class="section__head">
          <text class="section__title">今天穿了这些</text>
          <text v-if="guessing" class="section__hint">AI 识别中…</text>
          <text v-else class="section__hint">{{ selectedIds.length }} 件已选</text>
        </view>

        <!-- 衣橱为空：提示先去添加 -->
        <view v-if="!loadingGarments && garments.length === 0" class="tip">
          <text class="tip__t">衣橱还没有衣物</text>
          <text class="tip__s">只存美照也可以，或先去添加衣物</text>
        </view>

        <!-- 候选网格：点选切换，命中项高亮打勾 -->
        <view v-else class="picker">
          <view
            v-for="g in garments"
            :key="g.id"
            class="cand"
            :class="{ 'cand--on': selected.has(g.id) }"
            @click="toggle(g.id)"
          >
            <image
              class="cand__img"
              :src="g.cutoutImageUrl || g.originalImageUrl"
              mode="aspectFill"
            />
            <view v-if="selected.has(g.id)" class="cand__check">
              <text>✓</text>
            </view>
            <text class="cand__name">{{ g.name }}</text>
          </view>
        </view>
      </view>

      <!-- 场合（可选）：常用标签快选 -->
      <view class="section">
        <text class="section__title">场合</text>
        <view class="occasions">
          <view
            v-for="o in OCCASION_PRESETS"
            :key="o"
            class="occ"
            :class="{ 'occ--on': occasion === o }"
            @click="occasion = occasion === o ? '' : o"
          >
            {{ o }}
          </view>
        </view>
      </view>

      <!-- 备注（可选） -->
      <view class="section">
        <text class="section__title">备注</text>
        <textarea
          v-model="note"
          class="note"
          :maxlength="200"
          placeholder="随手记点什么，比如今天的心情或搭配灵感"
          placeholder-class="note__ph"
        />
      </view>

      <!-- 提交 -->
      <view class="submit">
        <AppButton :loading="saving" block size="large" @click="submit">
          完成打卡
        </AppButton>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import type { Garment } from '@zhiyi/shared';
import AppButton from '../../components/base/AppButton.vue';
import AppLoading from '../../components/base/AppLoading.vue';
import { listGarments } from '../../api/garment.api';
import {
  guessOutfit,
  createOutfit,
  type CreateOutfitPayload,
} from '../../api/outfit.api';
import { useUserStore } from '../../store/user';
import { useToast } from '../../composables/useToast';
import { useUpload } from '../../composables/useUpload';

/** 常用场合预设，快选降低录入摩擦 */
const OCCASION_PRESETS = ['通勤', '约会', '休闲', '运动', '正式', '居家'];

const userStore = useUserStore();
const { uploading, chooseAndUpload } = useUpload();

const photoUrl = ref<string | null>(null);
const garments = ref<Garment[]>([]);
const loadingGarments = ref(false);
const guessing = ref(false);
/** 已选单品 id 集合（Set 便于点选切换与判定高亮） */
const selected = ref<Set<string>>(new Set());
const occasion = ref('');
const note = ref('');
const saving = ref(false);
/** 记录来源：从今日推荐采纳带入 ai，否则 manual */
const source = ref<CreateOutfitPayload['source']>('manual');

/** selectedIds：给模板显示件数与提交用（Set 无法直接被模板计数） */
const selectedIds = ref<string[]>([]);
/** 同步 selected(Set) 到 selectedIds(数组)，保持两者一致 */
function syncSelected() {
  selectedIds.value = [...selected.value];
}

/**
 * 从今日推荐「采纳去打卡」带入：预选单品 id 与来源。
 * 带入时直接进单品选择态，用户仍可增减。
 */
onLoad((query) => {
  const q = (query ?? {}) as { itemIds?: string; source?: string };
  if (q.source === 'ai') source.value = 'ai';
  if (q.itemIds) {
    const ids = q.itemIds.split(',').filter(Boolean);
    selected.value = new Set(ids);
    syncSelected();
  }
  loadGarments();
});

/** 加载衣橱候选清单（供手动勾选） */
async function loadGarments() {
  loadingGarments.value = true;
  try {
    await userStore.ensureLogin();
    garments.value = await listGarments();
  } catch {
    // 提示已由请求器统一处理
  } finally {
    loadingGarments.value = false;
  }
}

/**
 * 选图并直传，成功后自动触发 AI 预猜。
 * 预猜是尽力而为：失败/空命中不阻塞，用户手动勾选即可。
 */
async function pickPhoto() {
  const up = await chooseAndUpload();
  if (!up) return;
  photoUrl.value = up.imageUrl;
  await runGuess(up.imageUrl);
}

/** 调 AI 预猜，把命中项并入已选（不清空用户/带入的已选） */
async function runGuess(url: string) {
  guessing.value = true;
  try {
    const { itemIds } = await guessOutfit(url);
    for (const id of itemIds) selected.value.add(id);
    syncSelected();
  } catch {
    // 尽力而为：预猜失败静默，用户手动选
  } finally {
    guessing.value = false;
  }
}

/** 点选切换单品 */
function toggle(id: string) {
  if (selected.value.has(id)) selected.value.delete(id);
  else selected.value.add(id);
  syncSelected();
}

/** 提交打卡：建记录 + 反哺穿着数，成功后回上一页 */
async function submit() {
  if (!photoUrl.value) {
    useToast().info('先选一张打卡照');
    return;
  }
  saving.value = true;
  try {
    await createOutfit({
      photoUrl: photoUrl.value,
      itemIds: selectedIds.value,
      occasion: occasion.value || undefined,
      note: note.value || undefined,
      source: source.value,
    });
    useToast().success('打卡成功');
    // 让 toast 露个脸再返回
    setTimeout(() => uni.navigateBack(), 600);
  } catch {
    // 提示已由请求器统一处理
  } finally {
    saving.value = false;
  }
}
</script>

<style lang="scss" scoped>
.checkin {
  min-height: 100vh;
  background: $zy-bg;
  padding: $zy-gap-lg;
  padding-bottom: calc(40px + env(safe-area-inset-bottom));
}
.photo__dz {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  border: 2px dashed $zy-line;
  border-radius: $zy-radius;
  background: $zy-surface;
}
.photo__dz-t {
  font-size: 16px;
  font-weight: 600;
  color: $zy-ink;
}
.photo__dz-s {
  margin-top: 8px;
  font-size: 13px;
  color: $zy-ink-2;
}
.photo__box {
  position: relative;
}
.photo__img {
  width: 100%;
  height: 320px;
  border-radius: $zy-radius;
  background: $zy-surface;
}
.photo__reset {
  position: absolute;
  right: 12px;
  bottom: 12px;
  padding: 6px 16px;
  border-radius: $zy-radius-pill;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 12px;
}
.hint {
  padding-top: 40px;
}
.section {
  margin-top: 24px;
}
.section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.section__title {
  font-size: 15px;
  font-weight: 700;
  color: $zy-ink;
}
.section__hint {
  font-size: 12px;
  color: $zy-ink-2;
}
.tip {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 0;
}
.tip__t {
  font-size: 14px;
  font-weight: 600;
  color: $zy-ink;
}
.tip__s {
  margin-top: 6px;
  font-size: 12px;
  color: $zy-ink-2;
}
.picker {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.cand {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.cand__img {
  width: 100%;
  height: 100px;
  border-radius: $zy-radius-sm;
  background: $zy-surface;
  border: 2px solid transparent;
}
.cand--on .cand__img {
  border-color: $zy-accent;
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
  width: 100%;
  font-size: 11px;
  color: $zy-ink-2;
  text-align: center;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.occasions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.occ {
  padding: 8px 16px;
  border-radius: $zy-radius-pill;
  background: $zy-surface;
  border: 1px solid $zy-line;
  font-size: 13px;
  font-weight: 600;
  color: $zy-ink-2;
}
.occ--on {
  background: $zy-accent;
  color: #fff;
  border-color: $zy-accent;
}
.note {
  width: 100%;
  height: 88px;
  padding: 12px;
  border-radius: $zy-radius-sm;
  background: $zy-surface;
  border: 1px solid $zy-line;
  font-size: 14px;
  color: $zy-ink;
  box-sizing: border-box;
}
.note__ph {
  color: $zy-ink-3;
}
.submit {
  margin-top: 32px;
}
</style>
