/**
 * 修改个人资料入参（设置页）。
 *
 * 两个字段都可选：只改传了的那个，避免「只换头像却把昵称清空」。
 * 空字符串视同未传（trim 后为空则走 transform 置 undefined），
 * 因为小程序输入框取消后常回传空串而非不传字段。
 */

import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUrl, Length } from 'class-validator';

/** 空串转 undefined，让可选字段的语义与「不传」一致 */
const blankToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class UpdateProfileDto {
  /** 昵称：trim 后 1~20 字；不传则不改 */
  @Transform(blankToUndefined)
  @IsOptional()
  @IsString()
  @Length(1, 20, { message: '昵称需为 1~20 个字符' })
  nickname?: string;

  /**
   * 头像 URL：必须是本人又拍云目录下的地址。
   *
   * 形态校验放这里，归属校验（路径是否落在 <userId>/avatars/）在 service——
   * DTO 拿不到当前用户，而「不是自己的目录」是业务合法性问题，不属于形态。
   */
  @Transform(blankToUndefined)
  @IsOptional()
  @IsUrl({}, { message: '头像地址不合法' })
  avatarUrl?: string;
}