/**
 * 用户分类接口（设置页分类管理）。
 *
 * 品类已从静态枚举升级为用户级数据（后端首次调用自动播种 14 个内置分类），
 * 录入表单 / 衣橱筛选的品类来源统一走这里；shared 常量仅作拉取失败时的兜底，
 * 避免网络异常时页面空白。
 */

import {
  CLOTHING_CATEGORIES,
  ACCESSORY_CATEGORIES,
  type MajorType,
} from '@zhiyi/shared';
import { http } from './request';

/** 用户分类记录（后端 categories 表行） */
export interface CategoryRecord {
  id: string;
  ownerId: string;
  name: string;
  majorType: MajorType;
  /** 是否播种自内置模板（仅信息展示，不影响可删性；「其他」由后端禁删） */
  builtin: boolean;
  createdAt: string;
}

/** 拉取当前用户全部分类（无则后端先播种再返回） */
export function listCategories() {
  return http.get<CategoryRecord[]>('/categories');
}

/**
 * 新建分类。
 * @param name 分类名（1~6 字，同用户内不重复）
 * @param majorType 所属大类
 */
export function createCategory(name: string, majorType: MajorType) {
  return http.post<CategoryRecord>('/categories', { name, majorType });
}

/** 查询分类下衣物件数（删除确认弹窗明示影响用） */
export function getCategoryUsage(id: string) {
  return http.get<{ count: number }>(`/categories/${id}/usage`);
}

/** 删除分类（该分类下衣物由后端事务归入「其他」；wx 无 PATCH，动作型走 POST） */
export function deleteCategory(id: string) {
  return http.post<{ reassigned: number }>(`/categories/${id}/delete`);
}

// ---- 模块级内存缓存 ----------------------------------------------------
// 录入表单与衣橱筛选都要分类列表，页面级各拉一次浪费；分类低频变更，
// 内存缓存 + 设置页改动后失效即可，不引入更重的 store。

let cache: CategoryRecord[] | null = null;

/** 拉取失败时的兜底列表：用内置模板拼出与后端播种一致的形状 */
function fallbackCategories(): CategoryRecord[] {
  const build = (names: readonly string[], majorType: MajorType) =>
    names.map((name) => ({
      id: `fallback-${name}`,
      ownerId: '',
      name,
      majorType,
      builtin: true,
      createdAt: '',
    }));
  return [
    ...build(CLOTHING_CATEGORIES, '服装'),
    ...build(ACCESSORY_CATEGORIES, '配饰'),
  ];
}

/**
 * 带缓存地取分类列表；网络失败时回退内置模板，保证界面永远有选项。
 * @param force 强制刷新（设置页增删后进入其他页时可靠起见由 invalidate 触发）
 */
export async function fetchCategoriesCached(force = false) {
  if (cache && !force) return cache;
  try {
    cache = await listCategories();
  } catch {
    // 错误提示已由请求器统一处理；这里兜底旧模板，避免表单/筛选空白
    return cache ?? fallbackCategories();
  }
  return cache;
}

/** 分类增删后调用，令下一次读取回源 */
export function invalidateCategoryCache() {
  cache = null;
}
