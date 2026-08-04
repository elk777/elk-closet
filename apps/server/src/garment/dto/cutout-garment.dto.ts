/**
 * 抠图入参：已上传的实物图 URL。
 *
 * 前端拍照/选图直传又拍云拿 URL 后，与识别并行调用本端点做背景移除。
 */

import { IsUrl } from 'class-validator';

export class CutoutGarmentDto {
  /** 实物图可公开访问的 URL（又拍云 CDN） */
  @IsUrl({}, { message: 'imageUrl 必须是合法 URL' })
  imageUrl!: string;
}
