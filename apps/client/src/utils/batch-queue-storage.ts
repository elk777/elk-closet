/**
 * 批次录入队列本地持久化。
 *
 * 连拍录入把「拍完一批 → 后台识别 → 回头确认」的中间态存在本机，
 * 使中途退出小程序后仍能回来接着确认（PRD R4）。
 * 只存元数据不存图片：选图返回的临时路径重启即失效，
 * 故恢复时改用已上传的远端 URL，传不成的项无从挽救、直接丢弃。
 */

import type { GarmentDraft } from '../components/garment/RecognitionForm.vue';

const QUEUE_KEY = 'zhiyi_batch_queue';

/** 批次内单项的生命周期状态 */
export type BatchItemStatus =
  /** 直传又拍云中 */
  | 'uploading'
  /** 识别 + 抠图并行进行中 */
  | 'processing'
  /** 识别完成（含低置信度），可入橱 */
  | 'ready'
  /** 上传失败（无图，不可入橱）或识别失败（有图，走先存后补） */
  | 'failed'
  /** 已入库 */
  | 'saved';

/** 批次内单项 */
export interface BatchItem {
  /** 本地生成的队列主键 */
  id: string;
  /** 选图返回的临时路径，上传阶段用作缩略图；重启后失效 */
  localPath: string;
  /** 上传成功后的又拍云 URL；null 表示尚未传成 */
  imageUrl: string | null;
  /** 抠图白底主图；null 时主图回退 imageUrl */
  cutoutImageUrl: string | null;
  /** 识别草稿；null 表示识别失败，走「先存图后补」 */
  draft: GarmentDraft | null;
  status: BatchItemStatus;
  /** 置信度偏低，确认列表提示用户核对 */
  lowConfidence: boolean;
}

/**
 * 读取队列并做恢复期状态归一。
 *
 * uploading/processing 的请求已随进程死掉，不可能自行恢复，
 * 故按数据完整度重判：有草稿归 ready，只有图归 failed（可先存后补），
 * 连图都没有的项丢弃。storage 异常或结构不符时清空重来，
 * 不让脏数据把录入入口卡死。
 * @returns 可继续使用的队列项（已剔除无效项）
 */
export function readQueue(): BatchItem[] {
  try {
    const raw = uni.getStorageSync(QUEUE_KEY);
    if (!raw || !Array.isArray(raw)) return [];
    return (raw as unknown[]).filter(isBatchItem).flatMap(normalize);
  } catch {
    clearQueue();
    return [];
  }
}

/** 写入队列（每次状态变更后调用；最多 9 项，同步写开销可忽略） */
export function writeQueue(items: BatchItem[]): void {
  try {
    uni.setStorageSync(QUEUE_KEY, items);
  } catch {
    // 写入失败仅损失「中途退出可恢复」，不影响当前批次进行中的流程
  }
}

/** 清空队列（批次全部入橱后，或读到脏数据时） */
export function clearQueue(): void {
  try {
    uni.removeStorageSync(QUEUE_KEY);
  } catch {
    // 清不掉也无妨：下次 readQueue 的归一会把无效项过滤掉
  }
}

/** 队列中是否还有没入橱的项，决定打开录入弹层时是否直接进批次视图 */
export function hasPendingItems(items: BatchItem[]): boolean {
  return items.some((it) => it.status !== 'saved');
}

/** 结构校验：只认字段齐全的项，防旧版本或人为篡改的脏数据 */
function isBatchItem(v: unknown): v is BatchItem {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.status === 'string';
}

/** 单项归一；返回空数组表示该项应被丢弃 */
function normalize(item: BatchItem): BatchItem[] {
  if (item.status === 'saved') return [];
  // 没传成的图：本地临时路径已失效，远端也没有，留着是死数据
  if (!item.imageUrl) return [];
  if (item.status === 'uploading' || item.status === 'processing') {
    return [{ ...item, status: item.draft ? 'ready' : 'failed' }];
  }
  return [item];
}
