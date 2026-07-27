/**
 * 全局枚举白名单：前后端共享的单一事实来源。
 *
 * 为什么集中在此：PRD 5.5 约定「核心字段定死 + Zod 双重约束」。
 * 这些常量同时被后端 Zod 校验、前端筛选/表单、AI prompt 引用，
 * 放一处避免三方漂移（后端加了品类、前端漏同步 → bug）。
 *
 * 例外：品类（CATEGORIES）已升级为用户级数据（categories 表，设置页可增删），
 * 运行时的品类白名单以用户分类表为准；此处的品类常量降级为
 * 「新用户播种模板 + 无用户上下文时的兜底」，不再是运行时校验依据。
 */

/** 大类：决定衣橱两组筛选（服装 / 配饰） */
export const MAJOR_TYPES = ['服装', '配饰'] as const;
export type MajorType = (typeof MAJOR_TYPES)[number];

/** 服装品类（播种模板：新用户默认分类的服装组） */
export const CLOTHING_CATEGORIES = [
  '上衣',
  '裤子',
  '半身裙',
  '连衣裙',
  '外套',
  '套装',
  '鞋子',
] as const;

/** 配饰品类（播种模板：新用户默认分类的配饰组；「其他」为 AI 兜底归属，禁删） */
export const ACCESSORY_CATEGORIES = [
  '包包',
  '帽子',
  '首饰',
  '眼镜',
  '腰带',
  '发饰',
  '其他',
] as const;

/**
 * 全部内置品类：新用户分类表的播种模板全集。
 * 运行时白名单以用户分类表为准（未命中归「其他」），此常量仅作模板与兜底。
 */
export const CATEGORIES = [
  ...CLOTHING_CATEGORIES,
  ...ACCESSORY_CATEGORIES,
] as const;
/** 内置品类的字面量联合：仅描述播种模板；运行时品类是用户级 string，勿用作衣物字段类型 */
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
 * 智能搭配的场合维度预设（PRD 4.5）。
 *
 * 供智能搭配页作 chip 切换、后端作 prompt 软约束用。区别于识别/衣物的
 * 结构化枚举：这是「用户想搭给什么场合」的意图选项，不落库、不校验衣物属性，
 * 因此单独成组而非复用 FORMALITY。
 */
export const OCCASION_OPTIONS = [
  '通勤',
  '约会',
  '正式',
  '休闲',
  '运动',
  '旅行',
] as const;
export type OccasionOption = (typeof OCCASION_OPTIONS)[number];

/**
 * 智能搭配的风格维度预设（PRD 4.5）。
 *
 * 与衣物的自由 styleTags 不同，这是给用户切换的固定风格意图选项，
 * 后端据此作 prompt 软约束，引导 AI 往该风格靠。
 */
export const STYLE_OPTIONS = [
  '极简',
  '通勤',
  '温柔',
  '复古',
  '街头',
  '运动',
] as const;
export type StyleOption = (typeof STYLE_OPTIONS)[number];

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
 *
 * 品类已用户化：有用户分类上下文时优先按用户分类表判断（自定义分类
 * 只能由此得知归属），未命中再按内置模板兜底（非服装内置品类一律视为配饰）。
 * @param category 品类名（可能是用户自定义分类）
 * @param userMajorTypes 用户分类名 → 大类 的映射，可选
 * @returns 对应大类
 */
export function majorTypeOf(
  category: string,
  userMajorTypes?: ReadonlyMap<string, MajorType>,
): MajorType {
  const fromUser = userMajorTypes?.get(category);
  if (fromUser) return fromUser;
  return (CLOTHING_CATEGORIES as readonly string[]).includes(category)
    ? '服装'
    : '配饰';
}
