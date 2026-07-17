/**
 * 穿搭日记领域模型与 AI 预猜契约（PRD 4.7）。
 *
 * 数据飞轮的「出」端：用户穿上后拍照打卡 → 记录用了衣橱哪几件
 * → 每件衣物 wearCount+1、lastWornAt 更新 → 反哺利用率/单次成本/推荐。
 *
 * 定位「只给自己看的私密视觉日记」：不社交、不加滤镜、不强迫每天打卡。
 */

import { z } from 'zod';
import { OUTFIT_SOURCES } from './enums';
import type { Garment } from './garment';
import type { RecommendWeather } from './ai';
import type { OutfitSource } from './enums';

/** 穿搭记录实体（对应 prisma Outfit 表） */
export interface Outfit {
  id: string;
  ownerId: string;
  /** 打卡美照 URL（对象存储） */
  photoUrl: string;
  /** 穿着日期（ISO 日期串，仅日期无时间，如 2026-07-17） */
  wornOn: string;
  /** 场合，如「通勤」；可空 */
  occasion: string | null;
  /** 记录来源：ai 推荐被采纳 / manual 自主 / tryon 试穿转化（用于推荐效果分析） */
  source: OutfitSource;
  /** 打卡时的天气快照；未取到为 null */
  weather: RecommendWeather | null;
  /** 随手备注；可空 */
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 穿搭记录富视图（前端渲染用）：在 Outfit 基础上展开关联的完整衣物。
 * 月历/详情要显示单品缩略图与名称，后端一次性回填，前端不再逐个回查。
 */
export interface OutfitView extends Outfit {
  /** 本套用到的衣物（已展开为完整实体，含图）。软删除的衣物仍保留在历史记录里 */
  items: Garment[];
}

/**
 * 创建打卡入参。
 *
 * itemIds 为用户最终确认的单品（AI 预猜后可增减）；允许为空——
 * 「只想存张美照、暂不关联单品」也是合法打卡，不阻塞（PRD 降摩擦原则）。
 * wornOn 缺省为服务端当天。
 */
export const CreateOutfitSchema = z.object({
  /** 打卡美照 URL（前端直传对象存储后回传） */
  photoUrl: z.string().url(),
  /** 用到的衣物 id 列表；可空（后端会校验归属并剔除非法 id） */
  itemIds: z.array(z.string()).default([]),
  /** 穿着日期（ISO 日期串）；缺省为服务端当天 */
  wornOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'wornOn 需为 YYYY-MM-DD')
    .optional(),
  /** 场合，可选，限长防滥用 */
  occasion: z.string().max(20).optional(),
  /** 来源，缺省 manual */
  source: z.enum(OUTFIT_SOURCES).default('manual'),
  /** 备注，可选 */
  note: z.string().max(200).optional(),
});
export type CreateOutfitInput = z.infer<typeof CreateOutfitSchema>;

/* ============================================================
   AI 预猜：打卡照里用了衣橱哪几件（PRD 4.7 系统预猜）
   ============================================================ */

/**
 * AI 预猜输出契约。
 *
 * 模型对着打卡照 + 衣橱候选单品图做视觉比对，返回命中的衣物 id。
 * 与推荐同款守卫思路：itemIds 真实性仍由后端二次校验（剔除编造/非本人）。
 */
export const GuessOutfitResultSchema = z.object({
  /** 判断穿在身上的衣物 id（取自候选清单） */
  itemIds: z.array(z.string()).default([]),
});
export type GuessOutfitResult = z.infer<typeof GuessOutfitResultSchema>;

/**
 * 从候选中剔除 AI 猜出的、实际不存在于衣橱的 id（防编造）。
 * @param guess AI 返回并已过 schema 的预猜结果
 * @param validIds 候选衣橱中真实存在的 id 集合
 * @returns 过滤后的命中 id 列表
 */
export function pruneGuess(
  guess: GuessOutfitResult,
  validIds: ReadonlySet<string>,
): string[] {
  return guess.itemIds.filter((id) => validIds.has(id));
}
