<template>
  <view class="board">
    <!-- 加载中 -->
    <view v-if="loading" class="state">
      <AppLoading text="正在盘点衣橱…" />
    </view>

    <!-- 数据不足：不展示误导性图表（PRD 5.6） -->
    <view v-else-if="insights.total < MIN_ITEMS" class="empty">
      <text class="empty-t">衣橱再丰富点，数据会更有意思</text>
      <text class="empty-s">先添加几件衣物，看板会慢慢长出来</text>
    </view>

    <template v-else>
      <!-- 核心指标：总数 / 总价值 / 近30天利用率 / 压箱底 -->
      <view class="stat-row">
        <view class="stat">
          <text class="stat__n">{{ insights.total }}</text>
          <text class="stat__l">衣物总数</text>
        </view>
        <view class="stat">
          <text class="stat__n">{{ valueText }}</text>
          <text class="stat__l">衣橱总价值</text>
        </view>
      </view>
      <view class="stat-row">
        <view class="stat">
          <text class="stat__n">{{ utilizationText }}</text>
          <text class="stat__l">近 30 天利用率</text>
        </view>
        <view class="stat">
          <text class="stat__n">{{ insights.idleCount }}</text>
          <text class="stat__l">压箱底未穿</text>
        </view>
      </view>

      <!-- 品类占比 -->
      <view class="panel">
        <text class="panel__h">品类占比</text>
        <view
          v-for="c in insights.categoryShares"
          :key="c.category"
          class="bar"
        >
          <text class="bar__label">{{ c.category }}</text>
          <view class="bar__track">
            <view class="bar__fill" :style="{ width: pct(c.ratio) }" />
          </view>
          <text class="bar__count">{{ c.count }}</text>
        </view>
      </view>

      <!-- 颜色分布：色块按占比横排 + 图例 -->
      <view class="panel">
        <text class="panel__h">颜色分布</text>
        <view class="color-dist">
          <view
            v-for="c in insights.colorShares"
            :key="c.colorHex"
            class="color-seg"
            :style="{ width: pct(c.ratio), background: c.colorHex }"
          />
        </view>
        <view class="color-legend">
          <view
            v-for="c in insights.colorShares"
            :key="c.colorHex"
            class="legend-item"
          >
            <view class="legend-dot" :style="{ background: c.colorHex }" />
            <text class="legend-label">{{ c.label }} {{ c.count }}</text>
          </view>
        </view>
      </view>

      <!-- 单次成本排行：越低越值，温柔提示不评判（PRD 4.8） -->
      <view v-if="insights.costRank.length" class="panel">
        <text class="panel__h">单次成本 · 越低越值</text>
        <view v-for="item in insights.costRank" :key="item.id" class="cost">
          <view class="legend-dot" :style="{ background: item.colorHex }" />
          <text class="cost__name zy-ellipsis">{{ item.name }}</text>
          <text class="cost__wear">穿过 {{ item.wearCount }} 次</text>
          <text class="cost__per">¥{{ item.costPerWear }}<text class="cost__unit">/次</text></text>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { computeInsights, type ClosetInsights, type Garment } from '@zhiyi/shared';
import AppLoading from '../../components/base/AppLoading.vue';
import { listGarments } from '../../api/garment.api';
import { useUserStore } from '../../store/user';

/** 看板成型的最小衣物数：不足则显示引导，避免误导性图表（PRD 5.6） */
const MIN_ITEMS = 3;

const userStore = useUserStore();
const loading = ref(true);
const garments = ref<Garment[]>([]);

/** 看板全部指标，一次从衣物列表算出（算法在 shared） */
const insights = computed<ClosetInsights>(() => computeInsights(garments.value));

/** 总价值：过万用 k 简写，呼应原型（如 ¥18.6k） */
const valueText = computed(() => {
  const v = insights.value.totalValue;
  if (v >= 10000) return `¥${(v / 1000).toFixed(1)}k`;
  return `¥${v}`;
});

/** 利用率百分比整数 */
const utilizationText = computed(
  () => `${Math.round(insights.value.utilization * 100)}%`,
);

/** 比例转 CSS 宽度百分比串 */
function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

async function load() {
  loading.value = true;
  try {
    await userStore.ensureLogin();
    garments.value = await listGarments();
  } catch {
    // 错误提示已由 request / ensureLogin 统一处理
  } finally {
    loading.value = false;
  }
}

// 每次进入刷新，保证反哺后的穿着数据即时反映到看板
onShow(() => {
  load();
});
</script>

<style lang="scss">
.board {
  min-height: 100vh;
  background: $zy-bg;
  padding: 16px 20px 40px;
}
.state {
  padding-top: 160px;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 140px;
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
.stat-row {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}
.stat {
  flex: 1;
  background: $zy-surface;
  border-radius: $zy-radius;
  padding: 20px 16px;
  box-shadow: $zy-shadow-soft;
}
.stat__n {
  display: block;
  font-size: 28px;
  font-weight: 700;
  color: $zy-ink;
}
.stat__l {
  display: block;
  margin-top: 6px;
  font-size: 13px;
  color: $zy-ink-2;
}
.panel {
  background: $zy-surface;
  border-radius: $zy-radius;
  padding: 18px 16px;
  margin-top: 16px;
  box-shadow: $zy-shadow-soft;
}
.panel__h {
  display: block;
  font-size: 15px;
  font-weight: 700;
  color: $zy-ink;
  margin-bottom: 14px;
}
.bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.bar__label {
  width: 56px;
  font-size: 13px;
  color: $zy-ink-2;
  flex-shrink: 0;
}
.bar__track {
  flex: 1;
  height: 10px;
  background: $zy-bg;
  border-radius: 5px;
  overflow: hidden;
}
.bar__fill {
  height: 100%;
  background: $zy-accent;
  border-radius: 5px;
}
.bar__count {
  width: 28px;
  text-align: right;
  font-size: 13px;
  color: $zy-ink-2;
  flex-shrink: 0;
}
.color-dist {
  display: flex;
  height: 16px;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 14px;
}
.color-seg {
  height: 100%;
}
.color-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid $zy-line;
  flex-shrink: 0;
}
.legend-label {
  font-size: 12px;
  color: $zy-ink-2;
}
.cost {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid $zy-line;
}
.cost:last-child {
  border-bottom: none;
}
.cost__name {
  flex: 1;
  font-size: 14px;
  color: $zy-ink;
}
.cost__wear {
  font-size: 12px;
  color: $zy-ink-3;
  flex-shrink: 0;
}
.cost__per {
  font-size: 15px;
  font-weight: 700;
  color: $zy-ink;
  flex-shrink: 0;
}
.cost__unit {
  font-size: 11px;
  font-weight: 400;
  color: $zy-ink-3;
}
</style>
