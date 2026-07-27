/**
 * 创建衣物入参（PRD 4.1 录入生命线）。
 *
 * 两条录入路径共用此 DTO：
 * - 完整录入：AI 识别 + 用户确认后，带齐结构化属性创建
 * - 先存图后补：只给 originalImageUrl，属性字段全缺省，稍后补（降低启动阻力优先于数据完整）
 *
 * 枚举字段复用 @zhiyi/shared 的白名单（单一事实来源），
 * 与 AI 契约、数据库三者一致；class-validator 在边界拦截非法值。
 * 例外：category 是用户级数据（分类表），DTO 只做形态约束，
 * 是否命中用户分类由 service 判断，未命中归「其他」（与 AI 识别兜底一致）。
 */

import {
  FORMALITY,
  MAJOR_TYPES,
  SEASONS,
  THICKNESS,
} from '@zhiyi/shared';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';

export class CreateGarmentDto {
  // ── 图片（必填：录入的最小前提是先有图）──
  /** 原图 URL（又拍云直传后的地址） */
  @IsUrl({}, { message: 'originalImageUrl 必须是合法 URL' })
  originalImageUrl!: string;

  /** 抠图去背景后的图；本版暂不抠图，允许缺省 */
  @IsOptional()
  @IsUrl({}, { message: 'cutoutImageUrl 必须是合法 URL' })
  cutoutImageUrl?: string;

  // ── 核心属性（先存图后补时全部可缺省）──
  /** 名称，缺省时服务端按品类兜底命名 */
  @IsOptional()
  @IsString()
  name?: string;

  /** 品类：用户级白名单（分类表）由 service 校验，未命中归「其他」 */
  @IsOptional()
  @IsString()
  category?: string;

  /** 大类：服装 | 配饰；缺省时按 category 推导 */
  @IsOptional()
  @IsIn(MAJOR_TYPES as readonly string[], { message: 'majorType 不在白名单内' })
  majorType?: string;

  /** 主色调中文名 */
  @IsOptional()
  @IsString()
  mainColor?: string;

  /** 近似色值 #RRGGBB */
  @IsOptional()
  @IsString()
  colorHex?: string;

  /** 材质，自由文本 */
  @IsOptional()
  @IsString()
  material?: string;

  /** 厚薄：薄 | 中 | 厚 */
  @IsOptional()
  @IsIn(THICKNESS as readonly string[], { message: 'thickness 不在白名单内' })
  thickness?: string;

  /** 适用季节数组：春/夏/秋/冬 */
  @IsOptional()
  @IsArray()
  @IsIn(SEASONS as readonly string[], {
    each: true,
    message: 'seasons 含非白名单值',
  })
  seasons?: string[];

  /** 正式度：休闲 | 日常 | 正式 */
  @IsOptional()
  @IsIn(FORMALITY as readonly string[], { message: 'formality 不在白名单内' })
  formality?: string;

  /** AI 风格标签，落 JSONB */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  styleTags?: string[];

  // ── 商业化钩子（可选，产品暂不暴露）──
  /** 品牌 */
  @IsOptional()
  @IsString()
  brand?: string;

  /** 价格（元，整数） */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  price?: number;
}
