<script setup lang="ts">
/**
 * 应用根组件。
 *
 * onLaunch 里静默登录：小程序端走微信 uni.login（用户无感），H5 端走 dev-login。
 * 拿到 token 后，后续所有受保护接口才不会 401。
 * 登录失败不白屏——弹可重试提示，用户仍可停留，下次进入页面会再触发 ensureLogin（幂等）。
 * 入口文件用相对路径（@ 别名在入口阶段不稳定）。
 */
import { onLaunch } from '@dcloudio/uni-app';
import { useUserStore } from './store/user';
import { prewarmTodayRecommendation } from './api/recommend.api';

/**
 * 登录后静默预热今日推荐。
 *
 * 今日推荐冷启动要等 AI 生成（实测 9~49s），而同一时段内结果对同一用户基本确定。
 * 启动时提前算好，用户稍后进首页即可命中缓存。
 *
 * fire-and-forget：await 会把启动挂住，比冷启动更糟。
 * 静默：用户可能根本不进首页，预热失败与他无关。不传 forceRefresh——已生成的
 * 推荐不该被覆盖。
 *
 * 并发安全由 prewarmTodayRecommendation 内部保证：它与首页 load() 共用同一个
 * in-flight 请求，冷启动时首页 onShow 与预热同时发起也只会真正调一次 AI。
 */
onLaunch(async () => {
  const user = useUserStore();
  try {
    await user.ensureLogin();
  } catch {
    // 登录失败不阻断：给一次重试机会，页面进入时会再幂等触发
    uni.showToast({ title: '登录失败，请检查网络后重试', icon: 'none' });
    return;
  }
  // 无 token 预热必 401，故放在登录成功之后；不 await，让预热与用户操作并行
  void prewarmTodayRecommendation();
});
</script>

<style lang="scss">
/* 全局基础样式：页面背景、字体、通用容器 */
@use './styles/base.scss';
</style>
