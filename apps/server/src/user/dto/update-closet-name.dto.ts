/**
 * 修改衣柜名入参（设置页）。
 *
 * trim 走 transform（class-validator 的 Length 不会自动去空白），
 * trim 后 1~16 字在 DTO 边界拦截，空白名进不来。
 */

import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class UpdateClosetNameDto {
  /** 衣柜名：trim 后 1~16 字 */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 16, { message: '衣柜名需为 1~16 个字符' })
  closetName!: string;
}
