/**
 * AI 能力契约（PRD 5.5）：识别 + 推荐的输入输出规范。
 *
 * 核心原则：契约由我们定死，AI 模型只是可替换执行者。
 * 这里的 Zod schema 是后端「永不信任 AI 原始输出」的守门人——
 * 所有模型返回必须过这一层校验，字段缺失 / 枚举非法 / 类型错误一律拦截。
 * schema 与 enums、数据库字段三者保持一致（单一事实来源）。
 */

import { z } from 'zod';
import {
  MAJOR_TYPES,
  THICKNESS,
  SEASONS,
  FORMALITY,
  type Season,
} from './enums';
import type { Garment } from './garment';

/* ============================================================
   能力一：衣物识别
   ============================================================ */

/**
 * 识别输出契约。
 *
 * 字段去向：category~formality 落结构化列；styleTags / extra 落 JSONB；
 * confidence 决定是否提示用户复核（低置信度高亮核对）。
 */
export const RecognitionResultSchema = z.object({
  /**
   * 品类：候选集是用户级数据（分类表），schema 无法静态枚举——
   * 是否命中由后端 service 按用户分类集判断，未命中归「其他」
   */
  category: z.string().min(1),
  /** 大类：服装 / 配饰 */
  majorType: z.enum(MAJOR_TYPES),
  /** 主色名，如「米白」 */
  mainColor: z.string().min(1),
  /** 近似色值，供色彩墙用 */
  colorHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'colorHex 必须是 #RRGGBB'),
  /** 材质，自由文本 */
  material: z.string().default(''),
  /** 厚薄 */
  thickness: z.enum(THICKNESS),
  /** 适用季节，可多选 */
  seasons: z.array(z.enum(SEASONS)).min(1),
  /** 正式度 */
  formality: z.enum(FORMALITY),
  /** 风格标签，自由数组 → JSONB */
  styleTags: z.array(z.string()).default([]),
  /** AI 自评置信度 0~1，低于阈值提示用户核对 */
  confidence: z.number().min(0).max(1),
  /** AI 的额外发现，原样存 JSONB，不做结构约束 */
  extra: z.record(z.string(), z.unknown()).default({}),
});
export type RecognitionResult = z.infer<typeof RecognitionResultSchema>;

/** 低于此置信度，在确认页高亮提示用户核对 */
export const RECOGNITION_CONFIDENCE_THRESHOLD = 0.75;

/* ============================================================
   能力一之二：购物截图提取
   ============================================================ */

/**
 * 截图提取输出契约。
 *
 * 与识别的本质区别：识别是「看衣服猜属性」（字段必填），提取是
 * 「读订单/商品页 UI 抄字段」——读不到的字段必须为 null，禁止编造。
 * 全 nullable 是 schema 级的防编造约束，与 prompt 双保险。
 */
export const ScreenshotExtractSchema = z.object({
  /** 商品标题（可整理为适合衣橱展示的短名） */
  name: z.string().min(1).nullable(),
  /** 品牌 */
  brand: z.string().min(1).nullable(),
  /** 价格（元），实付价优先、原价兜底 */
  price: z.number().min(0).nullable(),
  /** 颜色（订单规格/商品描述中的颜色文案） */
  mainColor: z.string().min(1).nullable(),
  /** 品类猜测：候选集同识别（用户分类表），命中判断在后端 service */
  categoryGuess: z.string().min(1).nullable(),
  /**
   * 第一张截图中商品展示图的区域（归一化 0~1，相对整图）：
   * 服务端据此裁出干净商品图当主图，免整张订单截图当封面的噪音。
   * 模型定位不准时为 null——nullable 兜底与其余字段同理，宁缺勿错。
   */
  imageBox: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      w: z.number().min(0).max(1),
      h: z.number().min(0).max(1),
    })
    .nullable()
    // bbox 是锦上添花：模型漏字段/坐标非法时按 null 兜底，绝不拖垮字段提取
    .catch(null),
  /** AI 自评整体置信度 0~1 */
  confidence: z.number().min(0).max(1),
});
export type ScreenshotExtractResult = z.infer<typeof ScreenshotExtractSchema>;

/* ============================================================
   能力二：搭配推荐
   ============================================================ */

/** 推荐输入：天气实况（来自天气 API，非 AI） */
export const RecommendWeatherSchema = z.object({
  /** 实测温度 ℃ */
  temp: z.number(),
  /** 体感温度 ℃ */
  feels: z.number(),
  /** 紫外线等级描述，如「强」；now 接口不含，本期恒为空串 */
  uv: z.string(),
  /** 降水概率 0~1（now 无概率字段，用有无降水近似 0/1，供推荐 prompt） */
  rain: z.number().min(0).max(1),
  /** 天气描述，如「多云转晴」 */
  desc: z.string(),
  /** 城市名（GeoAPI 反查）；取不到为空 */
  city: z.string().optional(),
  /** 相对湿度 %（now.humidity）；取不到为空 */
  humidity: z.number().optional(),
  /** 风向，如「东南风」（now.windDir）；取不到为空 */
  windDir: z.string().optional(),
  /** 风力等级，如「2」（now.windScale）；取不到为空 */
  windScale: z.string().optional(),
  /** 实测降水量 mm（now.precip）；用于前端合理展示，取不到为空 */
  precip: z.number().optional(),
});
export type RecommendWeather = z.infer<typeof RecommendWeatherSchema>;

/**
 * 衣橱摘要项：只传 id + 关键属性，不传图，控制 token 与成本。
 */
export const WardrobeBriefItemSchema = z.object({
  id: z.string(),
  /** 品类：用户级数据，可能是自定义分类，不做静态枚举约束 */
  category: z.string(),
  color: z.string(),
  seasons: z.array(z.enum(SEASONS)),
  formality: z.enum(FORMALITY),
  /** 风格标签：智能搭配按风格约束时喂给模型；今日推荐可传空数组 */
  styleTags: z.array(z.string()).default([]),
});
export type WardrobeBriefItem = z.infer<typeof WardrobeBriefItemSchema>;

/** 推荐输入契约（后端组装） */
export const RecommendInputSchema = z.object({
  /** 当前天气；未配置天气服务或取值失败时缺省，prompt 内按季节降级 */
  weather: RecommendWeatherSchema.optional(),
  /** 场合，可选 */
  occasion: z.string().optional(),
  /**
   * 目标风格（智能搭配维度）；作 prompt 软约束，引导模型往该风格靠。
   * 今日推荐不传。
   */
  style: z.string().optional(),
  /**
   * 目标季节（智能搭配维度）；后端已按季节硬过滤衣橱，此处再显式告知模型，
   * 强化「只用当季」约束。今日推荐不传（其季节感知交给天气）。
   */
  season: z.enum(SEASONS).optional(),
  /** 衣橱摘要 */
  wardrobe: z.array(WardrobeBriefItemSchema),
  /** 个性化偏好：越用越懂你 */
  preferences: z
    .object({
      favoriteStyles: z.array(z.string()).default([]),
      recentWornIds: z.array(z.string()).default([]),
    })
    .optional(),
});
export type RecommendInput = z.infer<typeof RecommendInputSchema>;

/** 单套推荐结果 */
export const RecommendedOutfitSchema = z.object({
  /** 组成单品 id：后端须校验全部存在于输入衣橱，防 AI 编造 */
  itemIds: z.array(z.string()).min(1),
  occasion: z.string().default(''),
  styleTag: z.string().default(''),
  /** 匹配度 0~100 */
  matchScore: z.number().min(0).max(100),
  /** 给用户看的推荐理由，非空 */
  reason: z.string().min(1),
});
export type RecommendedOutfit = z.infer<typeof RecommendedOutfitSchema>;

/** 推荐输出契约 */
export const RecommendOutputSchema = z.object({
  outfits: z.array(RecommendedOutfitSchema),
});
export type RecommendOutput = z.infer<typeof RecommendOutputSchema>;

/**
 * 校验推荐结果里的 itemIds 是否都真实存在于衣橱，剔除编造的单品。
 * @param output AI 返回并已过 schema 的推荐
 * @param validIds 衣橱中真实存在的衣物 id 集合
 * @returns 过滤后的推荐（丢弃 itemIds 全部非法的套装）
 */
export function pruneRecommend(
  output: RecommendOutput,
  validIds: ReadonlySet<string>,
): RecommendOutput {
  const outfits = output.outfits
    .map((o) => ({
      ...o,
      itemIds: o.itemIds.filter((id) => validIds.has(id)),
    }))
    .filter((o) => o.itemIds.length > 0);
  return { outfits };
}

/* ============================================================
   今日推荐：后端 → 前端的富返回契约
   ============================================================ */

/**
 * 解锁今日推荐所需的最少衣物件数（PRD 4.9「添加 3-5 件解锁」，取下限）。
 * 前后端共用：后端据此判断是否够料出推荐，前端据此展示解锁引导进度。
 */
export const RECOMMEND_UNLOCK_THRESHOLD = 3;

/**
 * 一套今日推荐（前端直接渲染用）。
 *
 * 在 RecommendedOutfit 的基础上，把 itemIds 展开为完整 Garment——
 * 前端要图、要名称，无需再逐个回查，后端组装时一次性填好。
 */
export interface RecommendedOutfitView {
  /** 组成单品（已展开为完整衣物，含图与属性） */
  items: Garment[];
  /** 适用场合，如「通勤」；AI 可能留空 */
  occasion: string;
  /** 风格标签，如「极简」；AI 可能留空 */
  styleTag: string;
  /** 匹配度 0~100，供前端展示 */
  matchScore: number;
  /** 推荐理由，给用户看的一段话 */
  reason: string;
}

/**
 * 今日推荐接口返回。
 *
 * 三种状态一个结构表达，前端据 status 分支渲染：
 * - locked：衣橱件数不足，引导继续添加（附当前/所需件数）
 * - ok：正常出推荐（weather 可能为 null——天气未配置/取失败时降级，不阻塞推荐）
 * - empty：件数够但 AI 没能产出可用套装（极端兜底，前端提示稍后再试）
 */
export interface TodayRecommendation {
  status: 'locked' | 'ok' | 'empty';
  /** 当前衣橱有效件数（排除闲置/软删除） */
  garmentCount: number;
  /** 解锁所需件数（= RECOMMEND_UNLOCK_THRESHOLD），locked 时前端算进度用 */
  unlockThreshold: number;
  /** 当前天气；未配置天气服务或取值失败时为 null（推荐已按季节降级） */
  weather: RecommendWeather | null;
  /** 推荐套装列表；locked / empty 时为空数组 */
  outfits: RecommendedOutfitView[];
  /**
   * 缓存已被标记过期（新增了当季衣物）。
   *
   * 为什么不直接重算：重算是 ~60s 的 AI 生成，录一件衣服就付一次代价不合理，
   * 尤其连拍批量录入。改为回传标记、首页出提示条，由用户决定何时刷新。
   */
  cacheStale?: boolean;
}

/* ============================================================
   今日推荐缓存：时段划分
   ============================================================ */

/** 推荐缓存时段：按穿衣决策节奏分三档，比「上午/下午」更贴合换装时机 */
export type Timeslot = 'morning' | 'noon' | 'evening';

/**
 * 按小时推断所属时段（前后端共用，保证缓存键口径一致）。
 *
 * 晚间跨零点（17:00–次日 05:00）合为一档：深夜与傍晚的穿衣决策同属「今天剩下的时间」，
 * 拆开会让 23 点和 18 点各生成一次，白付一次 AI 生成。
 * @param date 基准时间，缺省取当前
 * @returns 所属时段
 */
export function getTimeslot(date: Date = new Date()): Timeslot {
  const h = date.getHours();
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'noon';
  return 'evening';
}

/* ============================================================
   智能搭配：按 场合/风格/季节 维度切换的搭配（PRD 4.5）
   ============================================================ */

/**
 * 智能搭配返回。
 *
 * 与今日推荐同构但不含天气（搭配不绑定当下天气，由用户选的维度决定），
 * 且多一个 thin 态：
 * - locked：整个衣橱件数不足解锁阈值，引导继续添加
 * - thin：衣橱够，但所选季节下的当季衣物不足，提示换季节或添当季衣物
 * - ok：正常出搭配
 * - empty：料够但 AI 没产出可用套装（兜底，前端提示重试）
 */
export interface MatchedOutfits {
  status: 'locked' | 'thin' | 'ok' | 'empty';
  /** 当前衣橱有效件数（排除闲置/软删除） */
  garmentCount: number;
  /** 解锁所需件数（= RECOMMEND_UNLOCK_THRESHOLD） */
  unlockThreshold: number;
  /** 本次搭配采用的季节维度（跟随请求；缺省由后端按当前月份推断后回填） */
  season: Season;
  /** 搭配套装列表；locked / thin / empty 时为空数组 */
  outfits: RecommendedOutfitView[];
}

/**
 * 按公历月份推断当前季节（北半球常识）。
 * 前后端共用：前端进页面预选季节 chip，后端 season 缺省时兜底。
 * @param month 1~12 月；缺省取当前月
 * @returns 对应季节
 */
export function seasonOfMonth(month?: number): Season {
  const m = month ?? new Date().getMonth() + 1;
  if (m >= 3 && m <= 5) return '春';
  if (m >= 6 && m <= 8) return '夏';
  if (m >= 9 && m <= 11) return '秋';
  return '冬';
}

/* ============================================================
   能力三：AI 试穿（整套一次上身，PRD 4.6）
   ============================================================ */

/**
 * 试穿单品：喂给图像模型的一件衣服（图 + 简述）。
 *
 * 与推荐/预猜不同，试穿要「看图合成」，故必须传图 URL（非纯 id/属性）。
 * brief 辅助模型理解这是什么单品（品类+主色），提升合成贴合度。
 */
export const TryOnItemSchema = z.object({
  /** 单品图 URL（抠图优先、回退原图；由后端回填） */
  imageUrl: z.string().min(1),
  /** 一句话简述（品类+主色），辅助模型识别单品 */
  brief: z.string().default(''),
});
export type TryOnItem = z.infer<typeof TryOnItemSchema>;

/**
 * 试穿输入契约（后端组装后传给 Provider）。
 *
 * 首版「整套一次上身」：一张全身照 + 该套全部单品图，模型一次合成上身效果。
 * 逐件换留待后续（届时把 items 收敛为单件 + 传入「当前上身图」作底图即可，接口不破坏）。
 */
export const TryOnInputSchema = z.object({
  /** 用户全身照 URL（只传一次、复用；PRD 4.6） */
  bodyPhotoUrl: z.string().min(1),
  /** 本套要穿上身的单品（含图） */
  items: z.array(TryOnItemSchema).min(1),
  /** 场合，作 prompt 软约束，可选 */
  occasion: z.string().optional(),
  /** 风格，作 prompt 软约束，可选 */
  style: z.string().optional(),
});
export type TryOnInput = z.infer<typeof TryOnInputSchema>;

/**
 * 试穿输出契约。
 *
 * 图像模型返回二进制/base64，由后端落对象存储后回填 URL，前端只拿 URL 渲染。
 */
export const TryOnResultSchema = z.object({
  /** 合成上身图 URL（后端存 tryon 目录后回填） */
  imageUrl: z.string().min(1),
});
export type TryOnResult = z.infer<typeof TryOnResultSchema>;

/**
 * 试穿接口返回（后端 → 前端）。
 *
 * 三态一个结构表达，前端据 status 分支：
 * - no_body：用户还没上传全身照，引导先传（含隐私提示）
 * - ok：正常出上身图
 * - failed：模型生成失败/超时，提示稍后再试（不阻塞其他功能）
 */
export interface TryOnResponse {
  status: 'no_body' | 'ok' | 'failed';
  /** 合成上身图 URL；no_body / failed 时为空 */
  imageUrl: string;
}
