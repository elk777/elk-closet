/**
 * 创建分类入参（设置页「添加分类」）。
 *
 * 长度约束在 DTO 边界拦截；trim 后长度与同用户重名的最终裁决在 service
 * （trim 需要 transform，且唯一性只能查表判断）。
 */

import { Transform } from 'class-transformer';
import { IsIn, IsString, Length } from 'class-validator';
import { MAJOR_TYPES } from '@zhiyi/shared';

export class CreateCategoryDto {
  /** 分类名：trim 后 1~6 字 */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 6, { message: '分类名需为 1~6 个字符' })
  name!: string;

  /** 归入哪一组：服装 | 配饰 */
  @IsIn(MAJOR_TYPES as readonly string[], { message: 'majorType 不在白名单内' })
  majorType!: string;
}
