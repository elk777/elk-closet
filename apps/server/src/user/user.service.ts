/**
 * UserService：用户账号的建号与查询。
 *
 * 呼应 PRD 4.9「打开即用、数据从第一秒就绑定」——
 * 各登录入口（微信静默登录 / 开发登录）最终都落到 findOrCreate，
 * 保证同一身份稳定映射到同一 user，衣物从第一件起就挂在账号上。
 */

import { Injectable } from '@nestjs/common';
import { DEFAULT_CLOSET_NAME } from '@zhiyi/shared';
import { PrismaService } from '../prisma/prisma.service';

/** 可用于定位用户的第三方身份（互斥其一） */
interface Identity {
  wxMiniOpenid?: string;
  wxAppOpenid?: string;
  unionid?: string;
}

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 按第三方身份找用户，不存在则建号。
   *
   * 多端统一：优先用 unionid 收敛同一人；否则用端内 openid。
   * @param identity 第三方身份标识
   * @returns 已存在或新建的用户
   */
  async findOrCreate(identity: Identity) {
    const where = this.buildWhere(identity);
    const existing = where
      ? await this.prisma.user.findFirst({ where })
      : null;
    if (existing) {
      // 更新活跃时间用于留存分析，不阻塞主流程
      await this.prisma.user.update({
        where: { id: existing.id },
        data: { lastActiveAt: new Date() },
      });
      return existing;
    }
    return this.prisma.user.create({
      data: { ...identity, closetName: DEFAULT_CLOSET_NAME },
    });
  }

  /**
   * 按内部主键查用户，供 JwtAuthGuard 校验 token 主体仍存在。
   * @param id 用户内部主键
   */
  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
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
