/**
 * 上传相关接口。
 */

import {
  DEFAULT_UPLOAD_RESOURCE_TYPE,
  type UploadResourceType,
} from '@zhiyi/shared';
import { http } from './request';

/** 又拍云直传凭证（后端签名返回） */
export interface UpyunSignResult {
  uploadUrl: string;
  policy: string;
  authorization: string;
  saveKey: string;
  imageUrl: string;
}

/**
 * 获取又拍云直传签名。
 * @param ext 文件扩展名（jpg/png/...）
 * @param resourceType 资源类型，缺省 garments
 * @returns 直传凭证
 */
export function signUpload(
  ext: string,
  resourceType: UploadResourceType = DEFAULT_UPLOAD_RESOURCE_TYPE,
) {
  return http.post<UpyunSignResult>('/upload/upyun-sign', {
    ext,
    type: resourceType,
  });
}
