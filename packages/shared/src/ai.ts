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
  CATEGORIES,
  MAJOR_TYPES,
  THICKNESS,
  SEASONS,
  FORMALITY,
} from './enums';

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
  /** 品类：必须命中白名单；模型不确定时应返回「其他」 */
  category: z.enum(CATEGORIES),
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
   能力二：搭配推荐
   ============================================================ */

/** 推荐输入：天气实况（来自天气 API，非 AI） */
export const RecommendWeatherSchema = z.object({
  /** 实测温度 ℃ */
  temp: z.number(),
  /** 体感温度 ℃ */
  feels: z.number(),
  /** 紫外线等级描述，如「强」 */
  uv: z.string(),
  /** 降水概率 0~1 */
  rain: z.number().min(0).max(1),
  /** 天气描述，如「多云转晴」 */
  desc: z.string(),
});
export type RecommendWeather = z.infer<typeof RecommendWeatherSchema>;

/**
 * 衣橱摘要项：只传 id + 关键属性，不传图，控制 token 与成本。
 */
export const WardrobeBriefItemSchema = z.object({
  id: z.string(),
  category: z.enum(CATEGORIES),
  color: z.string(),
  seasons: z.array(z.enum(SEASONS)),
  formality: z.enum(FORMALITY),
});
export type WardrobeBriefItem = z.infer<typeof WardrobeBriefItemSchema>;

/** 推荐输入契约（后端组装） */
export const RecommendInputSchema = z.object({
  weather: RecommendWeatherSchema,
  /** 场合，可选 */
  occasion: z.string().optional(),
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
