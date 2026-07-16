import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';

/**
 * uni-app + Vite 配置。
 *
 * - scss.additionalData：把设计 token 变量全局注入每个 <style lang="scss">，
 *   组件内直接用 $zy-* 变量，无需逐文件手动 @import（单一事实来源）。
 *   tokens.scss 只含变量声明、无副作用，重复注入安全。
 */
export default defineConfig({
  plugins: [uni()],
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: '@import "@/styles/tokens.scss";',
      },
    },
  },
});
