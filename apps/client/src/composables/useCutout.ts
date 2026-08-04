/**
 * useCutout：对实物图做背景移除，产出白底主图 URL。
 *
 * 抠图是锦上添花：失败静默返回 null（页面回退原图当主图），不阻塞录入（PRD 5.6 生命线）。
 * 与识别并行调用、互不阻塞——识别读属性、抠图处理图，两件正交的事。
 */

import { ref } from 'vue';
import { cutoutGarment } from '../api/garment.api';

export function useCutout() {
  const cutting = ref(false);

  /**
   * 对一张已上传的实物图抠图去背景。
   * @param imageUrl 又拍云图 URL
   * @returns 白底图 URL；抠不出 / 失败返回 null（页面回退原图）
   */
  async function cutout(imageUrl: string): Promise<string | null> {
    cutting.value = true;
    try {
      const res = await cutoutGarment(imageUrl);
      return res.cutoutImageUrl;
    } catch {
      // 抠图失败静默兜底：返回 null，主图回退原图，不弹错误
      return null;
    } finally {
      cutting.value = false;
    }
  }

  return { cutting, cutout };
}
