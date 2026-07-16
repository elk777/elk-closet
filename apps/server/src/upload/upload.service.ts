/**
 * UploadService：签发又拍云直传凭证。
 *
 * 前端流程：调本服务拿凭证 → 直传又拍云 → 拿回图片 URL 回传录入接口。
 * 后端职责：用配置里的 operator/密码算签名，并把保存路径锁进用户自己的目录，
 * 防止越权覆盖他人文件；密码不下发。
 */

import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_UPLOAD_RESOURCE_TYPE,
  type UploadResourceType,
} from '@zhiyi/shared';
import type { UpyunConfig } from '../config/configuration';
import {
  makeUpyunFormSign,
  type UpyunSignResult,
} from './upyun-sign.util';

/** 允许的图片扩展名（呼应 PRD 5.6.1，仅常见格式） */
const ALLOWED_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'heic'] as const;
type AllowedExt = (typeof ALLOWED_EXTS)[number];

/** 直传图片体积上限（字节），与前端压缩策略对齐（PRD 5.6.1 限 2MB 级别） */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

@Injectable()
export class UploadService {
  constructor(private readonly config: ConfigService) {}

  /**
   * 为当前用户签发一张图的直传凭证。
   *
   * 保存路径固定为 `<uploadDir>/<userId>/<resourceType>/<uuid>.<ext>`：
   * - 按用户隔离目录：注销时整个 `<uploadDir>/<userId>/` 删净（PRD 可删除承诺）
   * - 按资源类型隔离：衣物图/日记照/试穿图/全身照分开，便于将来分别设公开读/私有权限
   * - 随机文件名：防覆盖与枚举
   * 路径只承载「稳定不变」的信息（谁的、哪类资源），不放会变的业务属性（如衣物品类）。
   * @param userId 当前登录用户 id（从 JWT 来，前端不可伪造目录）
   * @param ext 文件扩展名，限白名单
   * @param resourceType 资源类型，缺省为衣物图
   * @returns 直传凭证 + 直传成功后可访问的图片 URL
   */
  signUpload(
    userId: string,
    ext: string,
    resourceType: UploadResourceType = DEFAULT_UPLOAD_RESOURCE_TYPE,
  ): UpyunSignResult & { imageUrl: string } {
    const upyun = this.config.get<UpyunConfig>('upyun')!;
    const safeExt = this.normalizeExt(ext);
    const saveKey = `/${upyun.uploadDir}/${userId}/${resourceType}/${randomUUID()}.${safeExt}`;

    const sign = makeUpyunFormSign({
      bucket: upyun.bucket,
      operator: upyun.operator,
      password: upyun.password,
      saveKey,
      expiration: Math.floor(Date.now() / 1000) + upyun.signExpire,
      maxFileSize: MAX_FILE_SIZE,
    });

    // 直传成功后经 CDN 域名访问（衣物图公开读）
    const imageUrl = `${upyun.domain}${saveKey}`;
    return { ...sign, imageUrl };
  }

  /** 校验并归一化扩展名，非白名单一律回退 jpg */
  private normalizeExt(ext: string): AllowedExt {
    const lower = ext.toLowerCase().replace(/^\./, '');
    return (ALLOWED_EXTS as readonly string[]).includes(lower)
      ? (lower as AllowedExt)
      : 'jpg';
  }
}
