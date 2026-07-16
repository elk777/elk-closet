import { createSSRApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';

/**
 * uni-app 入口。
 *
 * 接入 pinia：user store 等全局状态依赖它，必须在此注册后才能在页面里使用。
 * 注意入口文件用相对路径引入（@ 别名在 main.ts/App.vue 入口阶段解析不稳定）。
 */
export function createApp() {
  const app = createSSRApp(App);
  app.use(createPinia());
  return {
    app,
  };
}
