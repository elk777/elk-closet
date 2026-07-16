/**
 * Prisma 生成产物的统一再导出。
 *
 * 为什么加这层：生成目录 generated/prisma 的相对路径又深又易变，
 * 业务代码统一从 '../prisma/client'（或经 tsconfig 路径别名）导入 PrismaClient
 * 与模型类型（User / Garment 等），把生成路径的细节收敛在一处，将来换生成位置只改这里。
 */

export * from '../generated/prisma/client';
