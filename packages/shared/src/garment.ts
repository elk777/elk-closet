/**
 * 衣物领域模型：对应 PRD 5. 数据模型的 Garment。
 *
 * 分两层存储（呼应选 PostgreSQL 的理由）：
 * - 结构化字段：直接落库列，供筛选/推荐/洞察
 * - styleTags / extra：AI 的额外发现，落 JSONB，不频繁改表
 */

import type {
  Category,
  Formality,
  MajorType,
  Season,
  Thickness,
} from './enums';

/** 衣物核心结构化字段（AI 识别 + 用户可改） */
export interface GarmentAttributes {
  /** 名称，如「米白针织衫」 */
  name: string;
  category: Category;
  majorType: MajorType;
  /** 主色调中文名，如「米白」 */
  mainColor: string;
  /** 近似色值，供色彩墙视图排序 */
  colorHex: string;
  /** 材质，自由文本，如「羊毛混纺」 */
  material: string;
  thickness: Thickness;
  seasons: Season[];
  formality: Formality;
}

/**
 * 商业化钩子：产品上暂不暴露（PRD 2.2），仅在模型埋点。
 * 将来做「同款复购 / 导购」时无需改表。
 */
export interface GarmentCommerce {
  brand?: string;
  price?: number;
  /** 购入时间（ISO 日期串） */
  purchasedAt?: string;
  /** 购买渠道，如「天猫」 */
  purchaseChannel?: string;
  /** 商品链接 */
  purchaseUrl?: string;
}

/** 穿着统计：由穿搭打卡自动更新（PRD 4.7 数据飞轮） */
export interface GarmentUsage {
  /** 累计穿着次数 */
  wearCount: number;
  /** 上次穿着日期（ISO 日期串），未穿过为 null */
  lastWornAt: string | null;
}

/** 衣物完整实体 */
export interface Garment extends GarmentAttributes, GarmentCommerce, GarmentUsage {
  id: string;
  ownerId: string;
  /** 原图 URL（对象存储） */
  originalImageUrl: string;
  /** 抠图去背景后的图 URL；抠图失败时回退用原图 */
  cutoutImageUrl: string | null;
  /** AI 打的自由风格标签，如 ['极简','通勤']（落 JSONB） */
  styleTags: string[];
  /** AI 的额外发现，原样保留（落 JSONB） */
  extra: Record<string, unknown>;
  /** 是否闲置（用户手动标记，进断舍离清单） */
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 计算单次成本（价格 ÷ 穿着次数），供详情页与看板。
 * @param price 价格；缺省或穿着为 0 时返回 null（无意义不显示）
 * @param wearCount 累计穿着次数
 * @returns 单次成本（元，四舍五入）或 null
 */
export function costPerWear(
  price: number | undefined,
  wearCount: number,
): number | null {
  if (!price || wearCount <= 0) return null;
  return Math.round(price / wearCount);
}

// ─────────────────────────────────────────────────────────────
// 搜索（PRD 4.4）与看板（PRD 4.8）的纯计算
//
// 为什么放 shared：衣橱是个人/熟人规模（几十件），首页已全量加载衣物，
// 搜索与看板指标全部可在前端即时算出，无需新增后端接口。算法沉到 shared，
// 前后端共享同一实现（将来后端要复用不重写），且与领域类型同源，避免漂移。
// ─────────────────────────────────────────────────────────────

/** 「压箱底 / 很久没穿」的判定阈值（天）：上次穿着距今超此天数，或从未穿过 */
export const IDLE_DAYS = 30;
/** 「高频」的判定阈值：累计穿着次数达此值即视为高频单品 */
export const FREQUENT_WEAR_COUNT = 10;

/** 搜索状态词 → 语义谓词的映射键（PRD 4.4：调用穿着数据的状态词） */
export type SearchStatusWord = '压箱底' | '很久没穿' | '高频';

/**
 * 判断衣物是否「压箱底」（很久没穿或从未穿过）。
 * @param g 衣物
 * @param now 参考时刻，默认当前；显式传入便于测试与保证一次查询一致
 * @returns 距上次穿着超过 IDLE_DAYS 天，或从未穿过，则为 true
 */
export function isIdle(g: Garment, now: Date = new Date()): boolean {
  if (!g.lastWornAt) return true;
  const days = (now.getTime() - new Date(g.lastWornAt).getTime()) / 86_400_000;
  return days > IDLE_DAYS;
}

/**
 * 关键词搜索：一个框搜所有维度 + 状态词（PRD 4.4）。
 *
 * 匹配维度：名称 / 品类 / 主色 / 材质 / 品牌 / 季节 / 风格标签（大小写不敏感）。
 * 状态词单独走穿着数据谓词：「压箱底」「很久没穿」→ isIdle；「高频」→ wearCount 达阈值。
 * @param list 衣物全集（通常为当前用户衣橱）
 * @param keyword 关键词；空串返回原列表（前端据此回落到分类筛选）
 * @param now 参考时刻，供状态词判定，默认当前
 * @returns 命中的衣物子集，保持入参顺序
 */
export function searchGarments(
  list: Garment[],
  keyword: string,
  now: Date = new Date(),
): Garment[] {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return list;

  const statusWord = STATUS_WORDS.find((w) => w === keyword.trim());
  if (statusWord) {
    return list.filter((g) =>
      statusWord === '高频'
        ? g.wearCount >= FREQUENT_WEAR_COUNT
        : isIdle(g, now),
    );
  }

  return list.filter((g) => garmentSearchText(g).includes(kw));
}

/** 支持的状态词全集（供搜索匹配与联想提示） */
const STATUS_WORDS: SearchStatusWord[] = ['压箱底', '很久没穿', '高频'];

/**
 * 拼出一件衣物的可搜文本（各维度小写拼接，一次算好用于 includes 匹配）。
 * @param g 衣物
 * @returns 归一化的可搜文本
 */
function garmentSearchText(g: Garment): string {
  return [
    g.name,
    g.category,
    g.mainColor,
    g.material,
    g.brand ?? '',
    ...g.seasons,
    ...g.styleTags,
    g.formality,
  ]
    .join(' ')
    .toLowerCase();
}

/**
 * 输入即联想：从衣橱现有数据里出候选词（PRD 4.4 输入即联想）。
 *
 * 候选来源：品类 / 主色 / 风格标签 / 季节 + 状态词，按在衣橱中出现频次高优先。
 * 空输入返回衣橱最常见的若干标签（供聚焦时直接点选）；有输入则做前缀/包含过滤。
 * @param list 衣物全集
 * @param input 已输入的文本
 * @param limit 返回上限，默认 8
 * @returns 联想词数组
 */
export function suggestKeywords(
  list: Garment[],
  input: string,
  limit = 8,
): string[] {
  const freq = new Map<string, number>();
  const bump = (word: string) => {
    const w = word.trim();
    if (w) freq.set(w, (freq.get(w) ?? 0) + 1);
  };
  for (const g of list) {
    bump(g.category);
    bump(g.mainColor);
    g.styleTags.forEach(bump);
    g.seasons.forEach(bump);
  }

  // 状态词恒在候选池内（衣橱里只要有对应单品就有意义）
  const kw = input.trim().toLowerCase();
  const pool = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w)
    .concat(STATUS_WORDS);

  const matched = kw
    ? pool.filter((w) => w.toLowerCase().includes(kw))
    : pool;

  // 去重后截断（Map 已保证词唯一，拼上状态词后再去一次重）
  return [...new Set(matched)].slice(0, limit);
}

/** 品类占比的一项 */
export interface CategoryShare {
  category: string;
  count: number;
  /** 占总数比例（0~1） */
  ratio: number;
}

/** 颜色分布的一项（按近似色值聚合） */
export interface ColorShare {
  /** 代表色值 #RRGGBB */
  colorHex: string;
  /** 该色的中文名（取该色值下最先出现的 mainColor） */
  label: string;
  count: number;
  ratio: number;
}

/** 单次成本排行的一项 */
export interface CostRankItem {
  id: string;
  name: string;
  colorHex: string;
  /** 单次成本（元），越低越值 */
  costPerWear: number;
  wearCount: number;
}

/** 衣橱洞察指标（PRD 4.8 看板），全部由衣物列表在前端算出 */
export interface ClosetInsights {
  /** 衣物总数（不含软删除，入参已过滤） */
  total: number;
  /** 衣橱总价值（Σ price，缺价按 0） */
  totalValue: number;
  /** 近 IDLE_DAYS 天利用率（0~1）：近 30 天穿过的件数占比；总数为 0 时为 0 */
  utilization: number;
  /** 压箱底未穿数（isIdle 为真的件数） */
  idleCount: number;
  /** 品类占比，按件数降序 */
  categoryShares: CategoryShare[];
  /** 颜色分布，按件数降序 */
  colorShares: ColorShare[];
  /** 单次成本排行（有价且穿过的单品），按单次成本升序（越低越值在前） */
  costRank: CostRankItem[];
}

/**
 * 一次算全看板指标（PRD 4.8）。
 * @param list 衣物全集（应已排除软删除）
 * @param now 参考时刻，供利用率/压箱底判定，默认当前
 * @returns 洞察指标
 */
export function computeInsights(
  list: Garment[],
  now: Date = new Date(),
): ClosetInsights {
  const total = list.length;
  const totalValue = list.reduce((sum, g) => sum + (g.price ?? 0), 0);

  const idleCount = list.filter((g) => isIdle(g, now)).length;
  // 利用率：近 30 天内穿过的件数占比（isIdle 的反面即近 30 天穿过）
  const utilization = total === 0 ? 0 : (total - idleCount) / total;

  const categoryShares = tally(list.map((g) => g.category)).map(
    ([category, count]) => ({ category, count, ratio: count / total }),
  );

  // 颜色按色值聚合，同色值取首个中文名作 label（避免「米白 / 米色」被拆成两条）
  const colorLabel = new Map<string, string>();
  for (const g of list) {
    if (!colorLabel.has(g.colorHex)) colorLabel.set(g.colorHex, g.mainColor);
  }
  const colorShares = tally(list.map((g) => g.colorHex)).map(
    ([colorHex, count]) => ({
      colorHex,
      label: colorLabel.get(colorHex) ?? colorHex,
      count,
      ratio: count / total,
    }),
  );

  const costRank = list
    .map((g) => {
      const cpw = costPerWear(g.price ?? undefined, g.wearCount);
      return cpw === null
        ? null
        : {
            id: g.id,
            name: g.name,
            colorHex: g.colorHex,
            costPerWear: cpw,
            wearCount: g.wearCount,
          };
    })
    .filter((x): x is CostRankItem => x !== null)
    .sort((a, b) => a.costPerWear - b.costPerWear);

  return {
    total,
    totalValue,
    utilization,
    idleCount,
    categoryShares,
    colorShares,
    costRank,
  };
}

/**
 * 统计一组键的出现次数并按次数降序。
 * @param keys 键序列
 * @returns [键, 次数][]，按次数降序
 */
function tally(keys: string[]): [string, number][] {
  const map = new Map<string, number>();
  for (const k of keys) map.set(k, (map.get(k) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}
