import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';

/**
 * uni-app + Vite 配置。
 *
 * - scss.additionalData：把设计 token 变量全局注入每个 <style lang="scss">，
 *   组件内直接用 $zy-* 变量，无需逐文件手动引入（单一事实来源）。
 *   用 @use ... as *（替代已弃用的 @import）：tokens.scss 只含变量声明、
 *   无副作用，as * 提升到全局作用域，重复注入由 @use 去重、安全。
 */
export default defineConfig({
  plugins: [uni()],
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: '@use "@/styles/tokens.scss" as *;',
      },
    },
  },
});
