/**
 * AI 试穿入参（PRD 4.6「整套一次上身」）。
 *
 * itemIds 为本套要穿上身的衣物 id（须全部属于当前用户，由 service 校验归属）；
 * occasion / style 作图像 prompt 的软约束，可选。
 */

import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import {
  OCCASION_OPTIONS,
  STYLE_OPTIONS,
  type OccasionOption,
  type StyleOption,
} from '@zhiyi/shared';

export class TryOnOutfitDto {
  /**
   * 本套单品 id。至少 1 件；上限 8 件——图像模型单次 edit 最多 16 图，
   * 留出全身照的位子并控制成本，一套穿搭 8 件足够。
   */
  @IsArray()
  @ArrayMinSize(1, { message: '至少选 1 件单品' })
  @ArrayMaxSize(8, { message: '单套单品不超过 8 件' })
  @IsString({ each: true })
  itemIds!: string[];

  /** 场合；作 prompt 软约束，可选 */
  @IsOptional()
  @IsIn(OCCASION_OPTIONS, { message: 'occasion 非法' })
  occasion?: OccasionOption;

  /** 风格；作 prompt 软约束，可选 */
  @IsOptional()
  @IsIn(STYLE_OPTIONS, { message: 'style 非法' })
  style?: StyleOption;
}
