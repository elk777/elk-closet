/**
 * CategoryService：用户级品类的业务核心（设置页分类管理）。
 *
 * 品类从「静态枚举」升级为「用户级数据」：本表是录入白名单 / AI 识别候选集 /
 * 衣橱筛选的单一事实来源。内置分类在用户首次触达时惰性播种（lazy seed），
 * 免去存量用户回填 migration；「其他」是 AI 兜底归属，禁删。
 */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ACCESSORY_CATEGORIES,
  CLOTHING_CATEGORIES,
  type MajorType,
} from '@zhiyi/shared';
import { PrismaService } from '../prisma/prisma.service';

/** AI 兜底分类名：不可删除，删除其他分类时衣物归入这里 */
export const FALLBACK_CATEGORY = '其他';

/** 兜底分类所属大类：「其他」在内置模板中归配饰组，重指派衣物时同步改写 */
const FALLBACK_MAJOR_TYPE: MajorType = '配饰';

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 列出用户全部分类；首次触达时先播种内置模板（新老用户行为与静态枚举时代一致）。
   * @param ownerId 归属用户 id
   * @returns 分类列表（按创建顺序，内置在前）
   */
  async list(ownerId: string) {
    await this.seedIfEmpty(ownerId);
    return this.prisma.category.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * 新增自定义分类。
   * @param ownerId 归属用户 id
   * @param name 分类名（DTO 已 trim + 长度校验）
   * @param majorType 服装 | 配饰
   * @returns 新建的分类
   * @throws ConflictException 同用户重名（跨服装/配饰组也不允许——品类名是全局筛选键）
   */
  async create(ownerId: string, name: string, majorType: string) {
    await this.seedIfEmpty(ownerId);
    const dup = await this.prisma.category.findUnique({
      where: { ownerId_name: { ownerId, name } },
    });
    if (dup) {
      throw new ConflictException(`分类「${name}」已存在`);
    }
    return this.prisma.category.create({
      data: { ownerId, name, majorType },
    });
  }

  /**
   * 统计某分类下未删除衣物件数——删除确认弹窗明示影响用。
   * @param ownerId 归属用户 id
   * @param id 分类 id
   * @returns 在用件数
   */
  async usage(ownerId: string, id: string): Promise<{ count: number }> {
    const category = await this.findOwned(ownerId, id);
    const count = await this.prisma.garment.count({
      where: { ownerId, category: category.name, deletedAt: null },
    });
    return { count };
  }

  /**
   * 删除分类：事务内先把该分类下衣物重指派到「其他」，再删分类——
   * 保证衣橱里不出现悬空品类。
   * @param ownerId 归属用户 id
   * @param id 分类 id
   * @returns 被重指派到「其他」的衣物件数
   * @throws BadRequestException 试图删「其他」（AI 识别的兜底归属，删了没处兜）
   */
  async remove(ownerId: string, id: string): Promise<{ reassigned: number }> {
    const category = await this.findOwned(ownerId, id);
    if (category.name === FALLBACK_CATEGORY) {
      throw new BadRequestException('「其他」是兜底分类，不可删除');
    }
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.garment.updateMany({
        where: { ownerId, category: category.name, deletedAt: null },
        data: { category: FALLBACK_CATEGORY, majorType: FALLBACK_MAJOR_TYPE },
      });
      await tx.category.delete({ where: { id: category.id } });
      return { reassigned: count };
    });
  }

  /**
   * 取用户分类名集合与「名 → 大类」映射，供录入校验与 AI 候选集拼装。
   * @param ownerId 归属用户 id
   */
  async namesOf(ownerId: string): Promise<{
    names: string[];
    majorTypes: Map<string, MajorType>;
  }> {
    const rows = await this.list(ownerId);
    return {
      names: rows.map((r) => r.name),
      majorTypes: new Map(rows.map((r) => [r.name, r.majorType as MajorType])),
    };
  }

  /**
   * 查分类并校验归属：非本人（或不存在）一律 404，不泄露他人分类是否存在。
   */
  private async findOwned(ownerId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, ownerId },
    });
    if (!category) {
      throw new NotFoundException('分类不存在');
    }
    return category;
  }

  /**
   * 惰性播种：该用户分类表为空时写入内置模板（服装 7 + 配饰 7）。
   * createMany 幂等风险低（先 count 判空），并发重复由唯一约束兜底。
   */
  private async seedIfEmpty(ownerId: string): Promise<void> {
    const count = await this.prisma.category.count({ where: { ownerId } });
    if (count > 0) return;
    await this.prisma.category.createMany({
      data: [
        ...CLOTHING_CATEGORIES.map((name) => ({
          ownerId,
          name,
          majorType: '服装',
          builtin: true,
        })),
        ...ACCESSORY_CATEGORIES.map((name) => ({
          ownerId,
          name,
          majorType: '配饰',
          builtin: true,
        })),
      ],
      skipDuplicates: true,
    });
  }
}
