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

import { IsBoolean, IsIn, IsOptional } from 'class-validator';
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

  /**
   * 强制重新生成，绕过当日缓存。
   *
   * 「换一批」用：用户要的就是换个结果，命中缓存等于点了没反应。
   * 注意全局 ValidationPipe 开了 whitelist，前端多传而 DTO 未声明的字段会被静默剥离，
   * 所以此字段必须在这里显式声明。
   */
  @IsOptional()
  @IsBoolean({ message: 'forceRefresh 必须是布尔值' })
  forceRefresh?: boolean;
}
