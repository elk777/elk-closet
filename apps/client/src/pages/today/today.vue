<template>
  <view class="today">
    <!-- 天气卡：本版为占位（真实天气 API 下一版接入） -->
    <view class="weather">
      <view class="weather__main">
        <text class="weather__temp">— °</text>
        <text class="weather__desc">天气接入中</text>
      </view>
      <text class="weather__hint">下一版接入实时天气，按温度体感为你挑衣</text>
    </view>

    <!-- 加载中 -->
    <view v-if="loading" class="state">
      <AppLoading text="正在读取衣橱…" />
    </view>

    <!-- 件数不足：解锁引导（PRD 4.9 冷启动钩子） -->
    <view v-else-if="count < UNLOCK_THRESHOLD" class="unlock">
      <text class="unlock__t">再添 {{ UNLOCK_THRESHOLD - count }} 件，解锁今日推荐</text>
      <text class="unlock__s">
        衣橱里有 {{ UNLOCK_THRESHOLD }} 件以上，我才好帮你搭出一套
      </text>
      <view class="unlock__bar">
        <view class="unlock__bar-fill" :style="{ width: progress + '%' }" />
      </view>
      <view class="unlock__cta" @click="goAddGarment">
        <text>去添加衣物</text>
      </view>
    </view>

    <!-- 件数已够：推荐位骨架（recommend 接口下一版接入） -->
    <view v-else class="preview">
      <view class="preview__badge">
        <text>预览 · 即将上线</text>
      </view>
      <view class="preview__card">
        <view class="preview__ph preview__ph--lg" />
        <view class="preview__ph-row">
          <view class="preview__ph preview__ph--sm" />
          <view class="preview__ph preview__ph--sm" />
          <view class="preview__ph preview__ph--sm" />
        </view>
        <text class="preview__reason">
          你的衣橱已有 {{ count }} 件，下一版将结合天气为你推荐整套穿搭并给出理由
        </text>
      </view>
      <view class="preview__cta" @click="goBack">
        <text>先去逛逛衣橱</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import AppLoading from '../../components/base/AppLoading.vue';
import { listGarments } from '../../api/garment.api';
import { useUserStore } from '../../store/user';

/** 解锁今日推荐所需的最少件数（PRD「添加 3-5 件解锁」，取下限 3） */
const UNLOCK_THRESHOLD = 3;

const count = ref(0);
const loading = ref(true);
const userStore = useUserStore();

/** 解锁进度百分比（封顶 100） */
const progress = computed(() =>
  Math.min(100, Math.round((count.value / UNLOCK_THRESHOLD) * 100)),
);

/**
 * 读取衣橱件数以决定展示解锁引导还是推荐骨架。
 * 先幂等确保登录，失败兜底停 loading（提示由请求器统一处理）。
 */
async function loadCount() {
  loading.value = true;
  try {
    await userStore.ensureLogin();
    const list = await listGarments();
    count.value = list.length;
  } catch {
    // 提示已由 request / ensureLogin 统一处理
  } finally {
    loading.value = false;
  }
}

onShow(() => {
  loadCount();
});

/** 返回衣橱首页去添加（首页有录入入口） */
function goAddGarment() {
  uni.navigateBack();
}

/** 返回上一页 */
function goBack() {
  uni.navigateBack();
}
</script>

<style lang="scss" scoped>
.today {
  min-height: 100vh;
  background: $zy-bg;
  padding: $zy-gap-lg;
}
.weather {
  background: $zy-accent;
  border-radius: $zy-radius;
  padding: 24px 20px;
  color: #fff;
}
.weather__main {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.weather__temp {
  font-size: 40px;
  font-weight: 700;
  color: #fff;
}
.weather__desc {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.85);
}
.weather__hint {
  display: block;
  margin-top: 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}
.state {
  padding-top: 120px;
}
.unlock {
  margin-top: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.unlock__t {
  font-size: 17px;
  font-weight: 700;
  color: $zy-ink;
}
.unlock__s {
  margin-top: 10px;
  font-size: 13px;
  color: $zy-ink-2;
  text-align: center;
}
.unlock__bar {
  width: 200px;
  height: 6px;
  border-radius: 3px;
  background: $zy-line;
  margin: 24px 0;
  overflow: hidden;
}
.unlock__bar-fill {
  height: 100%;
  background: $zy-accent;
  border-radius: 3px;
  transition: width 0.3s;
}
.unlock__cta {
  padding: 14px 28px;
  border-radius: 30px;
  background: $zy-accent;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
}
.preview {
  margin-top: 24px;
}
.preview__badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: $zy-radius-pill;
  background: #f0efeb;
  font-size: 11px;
  font-weight: 600;
  color: $zy-ink-2;
  margin-bottom: 14px;
}
.preview__card {
  background: $zy-surface;
  border-radius: $zy-radius;
  padding: 20px;
  box-shadow: $zy-shadow-soft;
}
.preview__ph {
  background: $zy-bg;
  border-radius: $zy-radius-sm;
}
.preview__ph--lg {
  height: 200px;
}
.preview__ph-row {
  display: flex;
  gap: 12px;
  margin-top: 14px;
}
.preview__ph--sm {
  flex: 1;
  height: 80px;
}
.preview__reason {
  display: block;
  margin-top: 16px;
  font-size: 13px;
  color: $zy-ink-2;
  line-height: 1.6;
}
.preview__cta {
  margin-top: 20px;
  text-align: center;
  padding: 14px;
  border-radius: $zy-radius-sm;
  background: $zy-surface;
  border: 1px solid $zy-line;
  font-size: 15px;
  font-weight: 600;
  color: $zy-ink;
}
</style>
