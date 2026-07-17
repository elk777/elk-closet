/**
 * 创建打卡入参（PRD 4.7 穿搭日记）。
 *
 * 降摩擦优先：itemIds 可空（只想存美照、暂不关联单品也是合法打卡），
 * wornOn 缺省为服务端当天。枚举来源复用 @zhiyi/shared 白名单，边界处校验。
 */

import { OUTFIT_SOURCES } from '@zhiyi/shared';
import {
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateOutfitDto {
  /** 打卡美照 URL（前端直传对象存储后回传） */
  @IsUrl({}, { message: 'photoUrl 必须是合法 URL' })
  photoUrl!: string;

  /** 用到的衣物 id 列表；可空（后端校验归属并剔除非法 id） */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  itemIds?: string[];

  /** 穿着日期（YYYY-MM-DD）；缺省为服务端当天 */
  @IsOptional()
  @IsISO8601({ strict: false }, { message: 'wornOn 需为合法日期串' })
  wornOn?: string;

  /** 场合，可选，限长防滥用 */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  occasion?: string;

  /** 记录来源：ai / manual / tryon，缺省 manual */
  @IsOptional()
  @IsIn(OUTFIT_SOURCES as readonly string[], { message: 'source 不在白名单内' })
  source?: string;

  /** 备注，可选 */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
