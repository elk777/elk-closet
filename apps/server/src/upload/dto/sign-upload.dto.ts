/**
 * 直传签名入参：前端告知文件扩展名与资源类型，用于拼保存路径。
 */

import { UPLOAD_RESOURCE_TYPES, type UploadResourceType } from '@zhiyi/shared';
import { IsIn, IsOptional } from 'class-validator';

/** 允许申请签名的图片扩展名（与 UploadService 白名单一致，边界即拦截） */
const SIGN_ALLOWED_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'heic'] as const;

export class SignUploadDto {
  /** 文件扩展名，限图片格式白名单 */
  @IsIn(SIGN_ALLOWED_EXTS, {
    message: `ext 必须是 ${SIGN_ALLOWED_EXTS.join(' / ')} 之一`,
  })
  ext!: (typeof SIGN_ALLOWED_EXTS)[number];

  /**
   * 资源类型，决定存进用户目录下哪个子目录；缺省为 garments（衣物图）。
   * 本期只用 garments，其余为后续模块预留。
   */
  @IsOptional()
  @IsIn(UPLOAD_RESOURCE_TYPES, {
    message: `type 必须是 ${UPLOAD_RESOURCE_TYPES.join(' / ')} 之一`,
  })
  type?: UploadResourceType;
}
