/**
 * useBatchQueue：连拍批次录入的队列编排。
 *
 * 把既有的单件能力（上传 / 识别 / 抠图 / 创建）串成流水线：
 * 拍摄不等识别，识别在后台受限并发地追赶，用户回头一次性确认（PRD R1/R2）。
 * 状态每次变更即落本地 storage，中途退出可恢复（R4）。
 */

import { ref } from 'vue';
import {
  readQueue,
  writeQueue,
  clearQueue,
  type BatchItem,
} from '../utils/batch-queue-storage';
import { useUpload } from './useUpload';
import { useRecognition } from './useRecognition';
import { useCutout } from './useCutout';
import { createGarment } from '../api/garment.api';

/**
 * 同时进行的识别项上限。
 *
 * 识别打 42w 公益站（单张 7~50s、渠道脆弱且后端无限流），
 * 并发全靠客户端兜住（PRD R7）。降为 1 即退化成串行。
 */
const MAX_CONCURRENT_RECOGNIZE = 2;

/** 单批次最多张数，与 uni.chooseImage 的相册多选上限一致 */
export const MAX_BATCH_SIZE = 9;

export function useBatchQueue() {
  const items = ref<BatchItem[]>([]);
  const { uploading, uploadEach } = useUpload();
  /** 正在跑识别的项数，配合 MAX_CONCURRENT_RECOGNIZE 做闸门 */
  let running = 0;
  /** 等待进入识别的项 id */
  const waiting: string[] = [];
  let seq = 0;

  /**
   * 从 storage 恢复上次未完成的批次。
   *
   * 仅在内存队列为空时恢复：识别在跑的项其状态存的是 processing，
   * 而 readQueue 的归一会把它判成 ready/failed——若此时覆盖内存，
   * 正在飞的请求回来还会 patch，两边打架。内存有数据就以内存为准。
   */
  function restore(): void {
    if (items.value.length) return;
    items.value = readQueue();
  }

  /** 状态变更统一出口：先改内存再落盘，避免两处不一致 */
  function patch(id: string, changes: Partial<BatchItem>): void {
    const idx = items.value.findIndex((it) => it.id === id);
    if (idx === -1) return;
    items.value[idx] = { ...items.value[idx], ...changes };
    writeQueue(items.value);
  }

  /**
   * 把已选中的多张图入队；每张传完立即排进识别，不等其余张。
   * @param localPaths 本地临时路径列表
   */
  async function addPaths(localPaths: string[]): Promise<void> {
    await uploadEach(localPaths, ({ localPath, imageUrl }) => {
      const id = `b${Date.now()}_${seq++}`;
      items.value.push({
        id,
        localPath,
        imageUrl,
        cutoutImageUrl: null,
        draft: null,
        // 传不成的项留在列表里让用户看见并可移除，但没有图无法入橱
        status: imageUrl ? 'processing' : 'failed',
        lowConfidence: false,
      });
      writeQueue(items.value);
      if (imageUrl) enqueue(id);
    });
  }

  /**
   * 排入识别等待区并尝试启动。
   *
   * 入队即标 processing：池满时该项要排队等，状态若停在 failed
   * 会让列表上的「重试识别」按钮继续显示、被反复点进队列，
   * 白白多打几发 42w 请求。
   */
  function enqueue(id: string): void {
    if (waiting.includes(id)) return;
    patch(id, { status: 'processing' });
    waiting.push(id);
    pump();
  }

  /** 有空槽就取一项开跑，直到打满闸门 */
  function pump(): void {
    while (running < MAX_CONCURRENT_RECOGNIZE && waiting.length) {
      const id = waiting.shift()!;
      void process(id);
    }
  }

  /**
   * 单项处理：识别与抠图并行发出（两件正交的事，互不阻塞）。
   * 每项用各自的 composable 实例，避免共用 lowConfidence 单例 ref 互相覆盖。
   */
  async function process(id: string): Promise<void> {
    const item = items.value.find((it) => it.id === id);
    if (!item?.imageUrl) return;
    running++;
    try {
      const { recognize, lowConfidence } = useRecognition();
      const { cutout } = useCutout();
      const [draft, cut] = await Promise.all([
        recognize(item.imageUrl),
        cutout(item.imageUrl),
      ]);
      patch(id, {
        draft,
        cutoutImageUrl: cut,
        // 识别失败仍算有图可入橱，走「先存图后补」，只是标记为 failed 提示用户
        status: draft ? 'ready' : 'failed',
        lowConfidence: draft ? lowConfidence.value : false,
      });
    } finally {
      running--;
      pump();
    }
  }

  /** 重试单项识别（列表上失败项可手动重试） */
  function retryItem(id: string): void {
    const item = items.value.find((it) => it.id === id);
    if (!item?.imageUrl) return;
    enqueue(id);
  }

  /** 移除单项（拍废了、或不想要了） */
  function removeItem(id: string): void {
    items.value = items.value.filter((it) => it.id !== id);
    writeQueue(items.value);
  }

  /** 编辑单项草稿（列表展开后复用 RecognitionForm） */
  function updateDraft(id: string, draft: BatchItem['draft']): void {
    patch(id, { draft });
  }

  /**
   * 批量入橱：逐件串行创建。
   *
   * 只收已出结果的项（ready / 识别失败但有图）。仍在上传或识别的项必须跳过：
   * 提前入库既丢掉即将返回的识别结果，回填时又会把 saved 覆写回 ready，
   * 用户再点一次「全部入橱」就会重复建同一件衣物。
   * 不做「全成功或全回滚」——已入橱的衣物再撤回反而违背「先囫囵存进去」，
   * 失败项留在队列标记 failed，用户可重试或移除。
   * @returns 本次成功入橱的件数
   */
  async function saveAll(): Promise<number> {
    let saved = 0;
    for (const item of items.value) {
      if (!item.imageUrl) continue;
      if (item.status !== 'ready' && item.status !== 'failed') continue;
      try {
        await createGarment({
          originalImageUrl: item.imageUrl,
          ...(item.cutoutImageUrl
            ? { cutoutImageUrl: item.cutoutImageUrl }
            : {}),
          ...(item.draft ?? {}),
        });
        patch(item.id, { status: 'saved' });
        saved++;
      } catch {
        patch(item.id, { status: 'failed' });
      }
    }
    // 全部入橱才清空；有残留则留着让用户下次接着处理
    if (items.value.every((it) => it.status === 'saved')) clear();
    return saved;
  }

  /** 清空队列与本地持久化 */
  function clear(): void {
    items.value = [];
    waiting.length = 0;
    clearQueue();
  }

  return {
    items,
    uploading,
    restore,
    addPaths,
    retryItem,
    removeItem,
    updateDraft,
    saveAll,
    clear,
  };
}
