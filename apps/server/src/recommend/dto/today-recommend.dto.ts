/**
 * 今日推荐入参（PRD 4.5）。
 *
 * 全部可选：
 * - 经纬度由前端 wx.getLocation 提供；未授权 / 无资质时不传，后端用兜底城市
 * - occasion 为用户主动指定的场合（如「通勤」「约会」），不传按日常推荐
 */

import { IsLatitude, IsLongitude, IsOptional, IsString, MaxLength } from 'class-validator';

export class TodayRecommendDto {
  /** 经度；前端定位得到，缺省用后端兜底城市 */
  @IsOptional()
  @IsLongitude({ message: 'lon 必须是合法经度' })
  lon?: number;

  /** 纬度；前端定位得到，缺省用后端兜底城市 */
  @IsOptional()
  @IsLatitude({ message: 'lat 必须是合法纬度' })
  lat?: number;

  /** 场合；不传按日常。限长防滥用 */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  occasion?: string;
}
