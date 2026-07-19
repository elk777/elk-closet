/**
 * 智能搭配入参（PRD 4.5）。
 *
 * 三个维度全部可选，由前端 chip 切换传入：
 * - occasion：场合意图，限 OCCASION_OPTIONS 白名单
 * - style：风格意图，限 STYLE_OPTIONS 白名单
 * - season：季节，限 SEASONS 白名单；不传时后端按当前月份推断
 *
 * 白名单校验防止前端传脏值污染 prompt。
 */

import { IsIn, IsOptional } from 'class-validator';
import {
  OCCASION_OPTIONS,
  SEASONS,
  STYLE_OPTIONS,
  type OccasionOption,
  type Season,
  type StyleOption,
} from '@zhiyi/shared';

export class MatchOutfitDto {
  /** 场合；不传按日常 */
  @IsOptional()
  @IsIn(OCCASION_OPTIONS, { message: 'occasion 非法' })
  occasion?: OccasionOption;

  /** 风格；不传不约束风格 */
  @IsOptional()
  @IsIn(STYLE_OPTIONS, { message: 'style 非法' })
  style?: StyleOption;

  /** 季节；不传按当前月份推断 */
  @IsOptional()
  @IsIn(SEASONS, { message: 'season 非法' })
  season?: Season;
}
