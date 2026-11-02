import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';

/**
 * uni-app + Vite 配置。
 *
 * - scss.additionalData：把设计 token 变量全局注入每个 <style lang="scss">，
 *   组件内直接用 $zy-* 变量，无需逐文件手动引入（单一事实来源）。
 *   用 @use ... as *（替代已弃用的 @import）：tokens.scss 只含变量声明、
 *   无副作用，as * 提升到全局作用域，重复注入由 @use 去重、安全。
 *
 * - server.proxy：仅对 H5 开发服务器生效。
 *   H5 的 API 基址是相对路径 `/api`（见 src/config/index.ts），生产由 Nginx
 *   反代；本地 `uni` 起的 dev server 没有反代能力，必须在这里补一条，
 *   否则所有请求都会 404。小程序端不走 vite dev server，此配置对它无影响。
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
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3100',
        changeOrigin: true,
      },
    },
  },
});
