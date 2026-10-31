<script setup lang="ts">
/**
 * 应用根组件。
 *
 * **不再在 onLaunch 里登录**：小程序审核要求用户主动授权，自动静默建号会被
 * 判定为未经授权收集信息。登录入口改为 pages/login/login.vue 上的按钮，
 * 由首页 onShow 里的 ensureLogin() 拦截跳转。
 *
 * onLaunch 只做「已登录时才预热」：无 token 预热必 401，且用户可能还没同意登录。
 * 入口文件用相对路径（@ 别名在入口阶段不稳定）。
 */
import { onLaunch } from '@dcloudio/uni-app';
import { useUserStore } from './store/user';
import { prewarmTodayRecommendation } from './api/recommend.api';

/**
 * 已登录时静默预热今日推荐。
 *
 * 今日推荐冷启动要等 AI 生成（实测 9~49s），而同一时段内结果对同一用户基本确定。
 * 提前算好，用户稍后进首页即可命中缓存。
 *
 * fire-and-forget：await 会把启动挂住，比冷启动更糟。
 * 未登录不预热：既必然 401，也违背「用户授权前不采集」的原则。
 */
onLaunch(() => {
  const user = useUserStore();
  // 仅判断本地是否有登录态；真实有效性交给首页 ensureLogin 校验
  if (!user.token) return;
  void prewarmTodayRecommendation();
});
</script>

<style lang="scss">
/* 全局基础样式：页面背景、字体、通用容器 */
@use './styles/base.scss';
</style>