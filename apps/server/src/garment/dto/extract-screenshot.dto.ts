/**
 * 截图提取入参：同一件商品的 1~3 张购物截图 URL。
 *
 * 前端同识别一样先直传又拍云拿 URL。多张用于订单页+商品页信息互补，
 * 上限 3 张控制 vision 调用体积（截图转 base64 内联后体积可观）。
 */

import { ArrayMaxSize, ArrayMinSize, IsArray, IsUrl } from 'class-validator';

export class ExtractScreenshotDto {
  /** 购物截图可公开访问的 URL（又拍云 CDN），1~3 张 */
  @IsArray()
  @ArrayMinSize(1, { message: '至少提供一张截图' })
  @ArrayMaxSize(3, { message: '最多支持 3 张截图' })
  @IsUrl({}, { each: true, message: 'imageUrls 每项必须是合法 URL' })
  imageUrls!: string[];
}
