/**
 * 更新衣物入参（PRD 4.3 编辑），承载 PUT /garments/:id 的部分更新。
 *
 * 全字段可选，语义约定：**undefined=不改该字段，null=清空**（仅 brand / price
 * 支持清空；@IsOptional 对 null 同样跳过校验，恰好放行这一表达）。
 * 用 PUT 而非语义更贴的 PATCH，是因为小程序 wx.request 不支持 PATCH——
 * 「PUT 本义全量替换」的语义损失以本注释与接口注释声明，换取 wx 兼容。
 *
 * 刻意不收的字段：
 * - majorType：一律由服务端按品类推导，不信客户端
 * - styleTags：AI 产出，表单只读
 * - colorHex：无取色 UI，改主色名不动色值（本期 non-goal）
 * - extra：服务端管理（换主图时由服务端解除 pendingPhoto），防客户端覆写整块 JSONB
 * - wearCount / lastWornAt / archived：各有专属路由（:id/wear、:id/archive）
 */

import { FORMALITY, SEASONS, THICKNESS } from '@zhiyi/shared';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';

export class UpdateGarmentDto {
  // ── 核心属性 ──
  /** 名称；空值不表达「清名」，客户端保证非空才发送 */
  @IsOptional()
  @IsString()
  name?: string;

  /** 品类：是否命中用户分类表由 service 判断，未命中归「其他」（与 create 一致） */
  @IsOptional()
  @IsString()
  category?: string;

  /** 主色调中文名 */
  @IsOptional()
  @IsString()
  mainColor?: string;

  /** 材质，自由文本；允许空串（与 create 的缺省兜底 '' 同格） */
  @IsOptional()
  @IsString()
  material?: string;

  /** 厚薄：薄 | 中 | 厚 */
  @IsOptional()
  @IsIn(THICKNESS as readonly string[], { message: 'thickness 不在白名单内' })
  thickness?: string;

  /** 适用季节数组：春/夏/秋/冬；非空由前端拦截保证，服务端不另加规则 */
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

  // ── 商业化钩子（null=清空）──
  /** 品牌；null 清空 */
  @IsOptional()
  @IsString()
  brand?: string | null;

  /** 价格（元，整数）；null 清空 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  price?: number | null;

  // ── 换主图 ──
  /** 新原图 URL；提供即视为换主图，服务端随之换掉旧抠图并解除「待补实物图」标记 */
  @IsOptional()
  @IsUrl({}, { message: 'originalImageUrl 必须是合法 URL' })
  originalImageUrl?: string;

  /** 新图的抠图产物；仅随 originalImageUrl 一起有意义，抠不出传 null（前端回退原图） */
  @IsOptional()
  @IsUrl({}, { message: 'cutoutImageUrl 必须是合法 URL' })
  cutoutImageUrl?: string | null;
}
