/**
 * 识别入参：一张已上传的衣物图 URL。
 *
 * 前端先经 /upload/upyun-sign 拿凭证直传又拍云，再把返回的 imageUrl 传到这里识别。
 * 识别只读图、不入库，结果给确认页预填。
 */

import { IsUrl } from 'class-validator';

export class RecognizeGarmentDto {
  /** 衣物图可公开访问的 URL（又拍云 CDN） */
  @IsUrl({}, { message: 'imageUrl 必须是合法 URL' })
  imageUrl!: string;
}
