/**
 * UserService：用户账号的建号与查询。
 *
 * 呼应 PRD 4.9「打开即用、数据从第一秒就绑定」——
 * 开发登录入口落到 findOrCreate；微信入口待接入后复用同一方法，
 * 保证同一身份稳定映射到同一 user，衣物从第一件起就挂在账号上。
 */

import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_CLOSET_NAME } from '@zhiyi/shared';
import type { UpyunConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';

/** 可用于定位用户的第三方身份（互斥其一） */
interface Identity {
  wxMiniOpenid?: string;
  wxAppOpenid?: string;
  unionid?: string;
}

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * 按第三方身份找用户，不存在则建号。
   *
   * 多端统一：unionid 与两端 openid 拼成 OR 查询，任一命中即视为同一人
   * （不设优先级：同一人多端登录时，先建号的那条身份决定用户记录）。
   * @param identity 第三方身份标识
   * @returns 已存在或新建的用户
   */
  async findOrCreate(identity: Identity) {
    const where = this.buildWhere(identity);
    const existing = where
      ? await this.prisma.user.findFirst({ where })
      : null;
    if (existing) {
      // 更新活跃时间用于留存分析，不阻塞主流程；
      // 顺带回填本次才拿到的身份：首次登录可能还没有 unionid（需开放平台绑定），
      // 后来有了就该补上，否则将来 App 端接入时会把同一人认成两个账号。
      await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          lastActiveAt: new Date(),
          ...(identity.unionid && !existing.unionid
            ? { unionid: identity.unionid }
            : {}),
        },
      });
      return existing;
    }
    return this.createOrRecover(identity);
  }

  /**
   * 建号，撞唯一约束时退化成「读已有记录」。
   *
   * 为什么需要这层：`findOrCreate` 是「先查后建」，不是原子操作。小程序启动时
   * App.vue 的 onLaunch 与页面 onShow 都会调 ensureLogin，两者并发就会同时
   * 走到 create，后到的那次撞 `wx_mini_openid` 唯一约束并抛 500——用户第一次
   * 打开小程序就有概率看到一次报错。
   *
   * 不做成 upsert：身份是 OR 查询（unionid / 两端 openid 任一命中），upsert 只能
   * 按单一唯一键，表达不了这个语义。这里用「建失败就再查一次」收口，普适且简单。
   * @param identity 第三方身份标识
   * @returns 本次建出的用户，或并发建号方刚建好的那条
   */
  private async createOrRecover(identity: Identity) {
    try {
      return await this.prisma.user.create({
        data: { ...identity, closetName: DEFAULT_CLOSET_NAME },
      });
    } catch (err) {
      // 只处理唯一约束冲突（P2002）；其它错误（连接失败等）照常抛出
      if (!this.isUniqueViolation(err)) throw err;
      const where = this.buildWhere(identity);
      const existing = where
        ? await this.prisma.user.findFirst({ where })
        : null;
      // 冲突了却查不到，说明不是本身份造成的，如实抛出，不吞
      if (!existing) throw err;
      return existing;
    }
  }

  /**
   * 判断是否为 Prisma 唯一约束冲突（P2002）。
   * @param err 捕获到的异常
   */
  private isUniqueViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      (err as { code?: string }).code === 'P2002'
    );
  }

  /**
   * 修改个人资料（设置页）：昵称 / 头像，只写传入的字段。
   *
   * 头像做归属校验：必须落在本人又拍云目录 `<uploadDir>/<userId>/avatars/` 下。
   * 不校验的话用户可以填任意 URL 当头像——既是越权引用，也让前台加载不可控的
   * 外部资源。URL 前缀而非精确 key 匹配，是因为 CDN 域名可能带查询串/不同协议头。
   * @param id 用户内部主键
   * @param dto 昵称 / 头像（均可选）
   * @returns 更新后的用户
   */
  async updateProfile(
    id: string,
    dto: { nickname?: string; avatarUrl?: string },
  ) {
    if (dto.avatarUrl) {
      const { uploadDir, domain } = this.config.get<UpyunConfig>('upyun')!;
      if (!this.isOwnAvatar(dto.avatarUrl, domain, uploadDir, id)) {
        throw new BadRequestException('头像地址不属于当前用户');
      }
    }
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.nickname !== undefined ? { nickname: dto.nickname } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
      },
    });
  }

  /**
   * 按内部主键查用户，供 JwtAuthGuard 校验 token 主体仍存在。
   * @param id 用户内部主键
   */
  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /**
   * 修改衣柜名（设置页）。
   * @param id 用户内部主键
   * @param closetName 新衣柜名（DTO 已 trim + 长度校验）
   * @returns 更新后的衣柜名（供前端回显）
   */
  async updateClosetName(
    id: string,
    closetName: string,
  ): Promise<{ closetName: string }> {
    await this.prisma.user.update({ where: { id }, data: { closetName } });
    return { closetName };
  }

  /**
   * 判断头像 URL 是否属于该用户的又拍云目录。
   *
   * 必须解析 URL 后比较 host 与 pathname，而不是 `includes()`：
   * 后者可被 `https://evil.com/?/garments/<id>/avatars/x.png` 这类构造绕过，
   * 把别人域名下的图当好头像存下来。
   * @param url 待校验的头像地址
   * @param domain 又拍云 CDN 域名（配置值）
   * @param uploadDir 上传根目录名
   * @param userId 当前用户主键
   * @returns 是否为本人头像目录下的地址
   */
  private isOwnAvatar(
    url: string,
    domain: string,
    uploadDir: string,
    userId: string,
  ): boolean {
    let parsed: URL;
    let expectedHost: string;
    try {
      parsed = new URL(url);
      expectedHost = new URL(domain).host;
    } catch {
      return false;
    }
    if (parsed.host !== expectedHost) return false;
    return parsed.pathname.startsWith(`/${uploadDir}/${userId}/avatars/`);
  }

  /** 把身份标识拼成 Prisma 的 OR 查询条件 */
  private buildWhere(identity: Identity) {
    const clauses = [];
    if (identity.unionid) clauses.push({ unionid: identity.unionid });
    if (identity.wxMiniOpenid)
      clauses.push({ wxMiniOpenid: identity.wxMiniOpenid });
    if (identity.wxAppOpenid)
      clauses.push({ wxAppOpenid: identity.wxAppOpenid });
    return clauses.length ? { OR: clauses } : null;
  }
}
