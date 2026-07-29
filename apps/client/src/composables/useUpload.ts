/**
 * useUpload：选图 + 又拍云直传。
 *
 * 封装「选图/拍照 → 取签名 → 表单直传又拍云 → 返回可访问 URL」全过程。
 * 页面只调 chooseAndUpload()，拿到 imageUrl 即可，不关心又拍云细节。
 */

import { ref } from 'vue';
import type { UploadResourceType } from '@zhiyi/shared';
import { signUpload, type UpyunSignResult } from '../api/upload.api';
import { useToast } from './useToast';

export function useUpload() {
  const uploading = ref(false);
  const progress = ref(0);

  /**
   * 选一张图并直传又拍云。
   * @param resourceType 资源类型（缺省衣物图；全身照传 body、试穿图传 tryon 等）
   * @returns 成功返回 { imageUrl }；用户取消或失败返回 null
   */
  async function chooseAndUpload(
    resourceType?: UploadResourceType,
  ): Promise<{ imageUrl: string } | null> {
    const [file] = await chooseImage(1);
    if (!file) return null;

    uploading.value = true;
    progress.value = 0;
    try {
      const ext = extractExt(file.path);
      const sign = await signUpload(ext, resourceType);
      await uploadToUpyun(sign, file.path, (p) => (progress.value = p));
      return { imageUrl: sign.imageUrl };
    } catch (e) {
      useToast().error('图片上传失败，请重试');
      return null;
    } finally {
      uploading.value = false;
    }
  }

  /**
   * 选多张图并逐张直传（截图导入：同一件商品的订单页+详情页 1~3 张）。
   *
   * 逐张串行上传，progress 反映整体进度；任一张失败即整体失败——
   * 半套截图会让提取缺关键字段，不如让用户整体重试。
   * @param count 最多可选张数
   * @param resourceType 资源类型（缺省衣物图）
   * @returns 成功返回全部图 URL（顺序同选图）；取消或失败返回 null
   */
  async function chooseAndUploadMany(
    count: number,
    resourceType?: UploadResourceType,
  ): Promise<string[] | null> {
    const files = await chooseImage(count);
    if (!files.length) return null;

    uploading.value = true;
    progress.value = 0;
    try {
      const urls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const sign = await signUpload(extractExt(files[i].path), resourceType);
        await uploadToUpyun(sign, files[i].path, (p) => {
          progress.value = Math.round((i * 100 + p) / files.length);
        });
        urls.push(sign.imageUrl);
      }
      return urls;
    } catch (e) {
      useToast().error('图片上传失败，请重试');
      return null;
    } finally {
      uploading.value = false;
    }
  }

  return {
    uploading,
    progress,
    chooseAndUpload,
    chooseAndUploadMany,
  };
}

/** 选图/拍照，返回临时文件列表 */
function chooseImage(count: number): Promise<Array<{ path: string }>> {
  return new Promise((resolve) => {
    uni.chooseImage({
      count,
      sourceType: ['album', 'camera'],
      success: (res) => {
        const paths = (res.tempFilePaths as string[]) || [];
        resolve(paths.map((path) => ({ path })));
      },
      fail: () => resolve([]),
    });
  });
}

/** 从文件路径提取扩展名 */
function extractExt(path: string): string {
  const m = path.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : 'jpg';
}

/** 表单直传又拍云（uni.uploadFile） */
function uploadToUpyun(
  sign: UpyunSignResult,
  filePath: string,
  onProgress: (p: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const task = uni.uploadFile({
      url: sign.uploadUrl,
      filePath,
      name: 'file',
      formData: {
        policy: sign.policy,
        authorization: sign.authorization,
      },
      success: (res) => {
        if (res.statusCode === 200) resolve();
        else reject(new Error(`又拍云上传失败(${res.statusCode})`));
      },
      fail: () => reject(new Error('又拍云上传网络错误')),
    });
    task.onProgressUpdate((res) => onProgress(res.progress));
  });
}
