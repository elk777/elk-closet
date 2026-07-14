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
