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
  makeUpyunRestPutSign,
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

  /**
   * 服务端直传一张图到又拍云（走 REST PUT，用于 AI 生成图，不经前端）。
   *
   * 与 signUpload 的区别：那是「签凭证交前端直传」，这是「后端拿着二进制自己传」——
   * AI 试穿图由模型返回 base64、在服务端生成，没有前端参与，故走 REST API。
   * 路径与 signUpload 同规则（用户隔离 + 资源类型隔离 + 随机名），保持存储结构一致。
   * @param userId 当前登录用户 id（隔离目录，前端不可伪造）
   * @param buffer 图片二进制
   * @param resourceType 资源类型（如 tryon）
   * @param ext 扩展名，限白名单，缺省 png（图像模型多返回 png）
   * @returns 上传成功后可访问的图片 URL
   * @throws 上传失败（网络/鉴权/又拍云拒绝）时抛错，供上层降级
   */
  async putImage(
    userId: string,
    buffer: Buffer,
    resourceType: UploadResourceType,
    ext = 'png',
  ): Promise<string> {
    const upyun = this.config.get<UpyunConfig>('upyun')!;
    const safeExt = this.normalizeExt(ext);
    const saveKey = `/${upyun.uploadDir}/${userId}/${resourceType}/${randomUUID()}.${safeExt}`;

    const sign = makeUpyunRestPutSign({
      bucket: upyun.bucket,
      operator: upyun.operator,
      password: upyun.password,
      saveKey,
      date: new Date().toUTCString(),
    });

    const resp = await fetch(sign.url, {
      method: 'PUT',
      headers: {
        Authorization: sign.authorization,
        Date: sign.date,
        'Content-Type': `image/${safeExt === 'jpg' ? 'jpeg' : safeExt}`,
      },
      body: new Uint8Array(buffer),
      // 又拍云半开连接会一直挂着，占满 Node 连接池；10MB 图正常几秒内传完
      signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      throw new Error(
        `又拍云 PUT 失败(${resp.status})：${detail.slice(0, 200)}`,
      );
    }

    return `${upyun.domain}${saveKey}`;
  }

  /** 校验并归一化扩展名，非白名单一律回退 jpg */
  private normalizeExt(ext: string): AllowedExt {
    const lower = ext.toLowerCase().replace(/^\./, '');
    return (ALLOWED_EXTS as readonly string[]).includes(lower)
      ? (lower as AllowedExt)
      : 'jpg';
  }
}
