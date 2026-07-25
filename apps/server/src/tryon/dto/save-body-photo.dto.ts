/**
 * 保存全身照入参（PRD 4.6「只传一次、复用」）。
 *
 * 前端把全身照直传又拍云 body 目录后，回传其 URL 到本接口存进 User.bodyPhotoUrl。
 * 只收 URL、不收图本体：与衣物图一致的「前端直传 + 回传 URL」范式。
 */

import { IsString, IsUrl } from 'class-validator';

export class SaveBodyPhotoDto {
  /** 全身照 URL（又拍云 CDN，前端直传后回传） */
  @IsString()
  @IsUrl({}, { message: 'bodyPhotoUrl 必须是合法 URL' })
  bodyPhotoUrl!: string;
}
