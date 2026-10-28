<template>
  <view class="diary">
    <!-- 月份切换条 -->
    <view class="monthbar">
      <view class="monthbar__nav" @click="prevMonth">
        <text class="monthbar__arrow">‹</text>
      </view>
      <text class="monthbar__label">{{ year }} 年 {{ month }} 月</text>
      <view
        class="monthbar__nav"
        :class="{ 'monthbar__nav--disabled': isCurrentMonth }"
        @click="nextMonth"
      >
        <text class="monthbar__arrow">›</text>
      </view>
    </view>

    <!-- 加载中 -->
    <view v-if="loading" class="state">
      <AppLoading text="加载中…" />
    </view>

    <!-- 本月空态 -->
    <view v-else-if="outfits.length === 0" class="empty">
      <text class="empty-t">这个月还没有穿搭记录</text>
      <text class="empty-s">穿上喜欢的一套，拍张照记录下来吧</text>
    </view>

    <!-- 打卡网格：每格一张美照 + 日期 -->
    <view v-else class="grid">
      <view
        v-for="o in outfits"
        :key="o.id"
        class="cell"
        @click="goDetail(o.id)"
      >
        <image class="cell__img" :src="o.photoUrl" mode="aspectFill" />
        <view class="cell__meta">
          <text class="cell__day">{{ dayOf(o.wornOn) }}</text>
          <text v-if="o.occasion" class="cell__occasion">{{ o.occasion }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import type { OutfitView } from '@zhiyi/shared';
import AppLoading from '../../components/base/AppLoading.vue';
import { listOutfitsByMonth } from '../../api/outfit.api';
import { useUserStore } from '../../store/user';

const userStore = useUserStore();

const now = new Date();
const year = ref(now.getFullYear());
const month = ref(now.getMonth() + 1); // 1~12

const outfits = ref<OutfitView[]>([]);
const loading = ref(true);

/** 是否停在当前月：当前月不允许再往后翻（未来没有记录） */
const isCurrentMonth = computed(
  () => year.value === now.getFullYear() && month.value === now.getMonth() + 1,
);

/** 取穿着日的「日」部分（wornOn 为 YYYY-MM-DD 或含时区的 ISO 串） */
function dayOf(wornOn: string): string {
  const d = wornOn.slice(8, 10);
  return `${Number(d)}日`;
}

/**
 * 加载当月打卡记录。
 * 失败提示由请求器统一处理，这里只兜底停 loading。
 */
async function load() {
  loading.value = true;
  try {
    await userStore.ensureLogin();
    outfits.value = await listOutfitsByMonth(year.value, month.value);
  } catch {
    // 提示已由 request / ensureLogin 统一处理
  } finally {
    loading.value = false;
  }
}

/** 上一月：跨年时回退到上一年 12 月 */
function prevMonth() {
  if (month.value === 1) {
    year.value -= 1;
    month.value = 12;
  } else {
    month.value -= 1;
  }
  load();
}

/** 下一月：已在当前月则禁止（不看未来） */
function nextMonth() {
  if (isCurrentMonth.value) return;
  if (month.value === 12) {
    year.value += 1;
    month.value = 1;
  } else {
    month.value += 1;
  }
  load();
}

// 每次进入刷新（打卡返回后当月记录应更新）
onShow(() => {
  load();
});

/** 跳打卡详情（路径须与 pages.json 注册的 pages/diary/detail 一致） */
function goDetail(id: string) {
  uni.navigateTo({ url: `/pages/diary/detail?id=${id}` });
}
</script>

<style lang="scss" scoped>
.diary {
  min-height: 100vh;
  background: $zy-bg;
  padding: $zy-gap-lg;
}
.monthbar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  margin-bottom: 20px;
}
.monthbar__nav {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: $zy-surface;
  border: 1px solid $zy-line;
  display: flex;
  align-items: center;
  justify-content: center;
}
.monthbar__nav--disabled {
  opacity: 0.35;
}
.monthbar__arrow {
  font-size: 20px;
  color: $zy-ink;
  line-height: 1;
}
.monthbar__label {
  font-size: 16px;
  font-weight: 700;
  color: $zy-ink;
  min-width: 120px;
  text-align: center;
}
.state {
  padding-top: 120px;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 120px;
}
.empty-t {
  font-size: 16px;
  font-weight: 600;
  color: $zy-ink;
}
.empty-s {
  margin-top: 8px;
  font-size: 13px;
  color: $zy-ink-2;
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}
.cell {
  border-radius: $zy-radius-sm;
  overflow: hidden;
  background: $zy-surface;
  box-shadow: $zy-shadow-soft;
}
.cell__img {
  width: 100%;
  height: 220px;
  background: $zy-bg;
}
.cell__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
}
.cell__day {
  font-size: 14px;
  font-weight: 600;
  color: $zy-ink;
}
.cell__occasion {
  font-size: 12px;
  color: $zy-ink-2;
}
</style>
