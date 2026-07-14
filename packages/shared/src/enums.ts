/**
 * 全局枚举白名单：前后端共享的单一事实来源。
 *
 * 为什么集中在此：PRD 5.5 约定「核心字段定死 + Zod 双重约束」。
 * 这些常量同时被后端 Zod 校验、前端筛选/表单、AI prompt 引用，
 * 放一处避免三方漂移（后端加了品类、前端漏同步 → bug）。
 */

/** 大类：决定衣橱两组筛选（服装 / 配饰） */
export const MAJOR_TYPES = ['服装', '配饰'] as const;
export type MajorType = (typeof MAJOR_TYPES)[number];

/** 服装品类 */
export const CLOTHING_CATEGORIES = [
  '上衣',
  '裤子',
  '半身裙',
  '连衣裙',
  '外套',
  '套装',
  '鞋子',
] as const;

/** 配饰品类 */
export const ACCESSORY_CATEGORIES = [
  '包包',
  '帽子',
  '首饰',
  '眼镜',
  '腰带',
  '发饰',
  '其他',
] as const;

/** 全部品类白名单：AI 识别的 category 必须命中其一，否则归「其他」 */
export const CATEGORIES = [
  ...CLOTHING_CATEGORIES,
  ...ACCESSORY_CATEGORIES,
] as const;
export type Category = (typeof CATEGORIES)[number];

/** 厚薄：驱动天气推荐（冷天优先厚款） */
export const THICKNESS = ['薄', '中', '厚'] as const;
export type Thickness = (typeof THICKNESS)[number];

/** 适用季节 */
export const SEASONS = ['春', '夏', '秋', '冬'] as const;
export type Season = (typeof SEASONS)[number];

/** 正式度：驱动场合推荐（通勤/正式场合过滤休闲款） */
export const FORMALITY = ['休闲', '日常', '正式'] as const;
export type Formality = (typeof FORMALITY)[number];

/** 穿搭记录来源：区分 AI 推荐被采纳 / 自主搭配 / 试穿转化，用于推荐效果分析 */
export const OUTFIT_SOURCES = ['ai', 'manual', 'tryon'] as const;
export type OutfitSource = (typeof OUTFIT_SOURCES)[number];

/**
 * 对象存储资源类型：决定图片存进用户目录下的哪个子目录。
 *
 * 上传路径为 `<根目录>/<userId>/<资源类型>/<uuid>.<ext>`——
 * 资源类型在上传时即确定且永不改变（区别于「品类」这种 AI 识别后才知、且可改的业务属性，
 * 后者交由数据库字段管理，不进存储路径）。
 * - garments：衣物图（公开读）
 * - outfits：穿搭日记照（公开读，P1）
 * - tryon：AI 试穿图（敏感，P2，将来私有桶）
 * - body：全身照（敏感，P2，将来私有桶）
 */
export const UPLOAD_RESOURCE_TYPES = [
  'garments',
  'outfits',
  'tryon',
  'body',
] as const;
export type UploadResourceType = (typeof UPLOAD_RESOURCE_TYPES)[number];

/** 资源类型缺省值：本期只用衣物图，签名接口不传 type 时按此归目录 */
export const DEFAULT_UPLOAD_RESOURCE_TYPE: UploadResourceType = 'garments';

/**
 * 判断品类属于服装还是配饰。
 * @param category 品类
 * @returns 对应大类
 */
export function majorTypeOf(category: Category): MajorType {
  return (CLOTHING_CATEGORIES as readonly string[]).includes(category)
    ? '服装'
    : '配饰';
}
