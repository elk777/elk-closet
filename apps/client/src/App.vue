<script setup lang="ts">
/**
 * 应用根组件。
 *
 * onLaunch 里静默登录（A 方案 dev-login）：拿到 token 后，后续所有受保护接口才不会 401。
 * 登录失败不白屏——弹可重试提示，用户仍可停留，下次进入页面会再触发 ensureLogin（幂等）。
 * 入口文件用相对路径（@ 别名在入口阶段不稳定）。
 */
import { onLaunch } from '@dcloudio/uni-app';
import { useUserStore } from './store/user';

onLaunch(async () => {
  const user = useUserStore();
  try {
    await user.ensureLogin();
  } catch {
    // 登录失败不阻断：给一次重试机会，页面进入时会再幂等触发
    uni.showToast({ title: '登录失败，请检查网络后重试', icon: 'none' });
  }
});
</script>

<style lang="scss">
/* 全局基础样式：页面背景、字体、通用容器 */
@import './styles/base.scss';
</style>
