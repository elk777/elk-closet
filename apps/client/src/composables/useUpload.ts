/**
 * useUpload：选图 + 又拍云直传。
 *
 * 封装「选图/拍照 → 取签名 → 表单直传又拍云 → 返回可访问 URL」全过程。
 * 页面只调 chooseAndUpload()，拿到 imageUrl 即可，不关心又拍云细节。
 */

import { ref } from 'vue';
import { signUpload, type UpyunSignResult } from '../api/upload.api';
import { useToast } from './useToast';

export function useUpload() {
  const uploading = ref(false);
  const progress = ref(0);

  /**
   * 选一张图并直传又拍云。
   * @returns 成功返回 { imageUrl }；用户取消或失败返回 null
   */
  async function chooseAndUpload(): Promise<{ imageUrl: string } | null> {
    const [file] = await chooseImage();
    if (!file) return null;

    uploading.value = true;
    progress.value = 0;
    try {
      const ext = extractExt(file.path);
      const sign = await signUpload(ext);
      await uploadToUpyun(sign, file.path, (p) => (progress.value = p));
      return { imageUrl: sign.imageUrl };
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
  };
}

/** 选图/拍照，返回临时文件列表 */
function chooseImage(): Promise<Array<{ path: string }>> {
  return new Promise((resolve) => {
    uni.chooseImage({
      count: 1,
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
