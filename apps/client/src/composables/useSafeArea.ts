/**
 * useSafeArea：自定义导航栏（navigationStyle: custom）下的安全区适配。
 *
 * custom 模式下页面从屏幕顶部起绘，顶栏需自行避开两处系统占位，否则会被覆盖：
 * - 状态栏（含刘海 / 挖孔 / 灵动岛）：内容须整体下移一个状态栏高度
 * - 微信右上角胶囊按钮：顶栏右侧内容须留出其宽度，避免重叠
 *
 * 值随机型不同（statusBarHeight 20~59px 不等），故运行时实测而非写死。
 */
import { ref } from 'vue';

export function useSafeArea() {
  /** 状态栏高度（px）：顶栏 padding-top 至少留出此距离，避免被刘海/状态栏覆盖 */
  const statusBarHeight = ref(0);
  /** 顶栏右侧避让宽度（px）：留出微信胶囊按钮占位；非小程序端为 0 */
  const menuInset = ref(0);
  /**
   * 胶囊按钮上边缘的 y 坐标（px，相对屏幕顶部，已含状态栏高度）。
   * 顶栏首行内容应从此处起绘并与胶囊同高，二者才垂直对齐、互不遮挡。
   * 非小程序端无胶囊，兜底为状态栏高度。
   */
  const menuTop = ref(0);
  /** 胶囊按钮高度（px）：顶栏首行与之等高，实现垂直居中对齐。非小程序端兜底 32 */
  const menuHeight = ref(32);

  const info = uni.getWindowInfo();
  statusBarHeight.value = info.statusBarHeight ?? 0;
  menuTop.value = statusBarHeight.value;

  // #ifdef MP-WEIXIN
  // 胶囊按钮悬浮于右上角，顶栏右侧内容的右边界须对齐其左边缘，首行须与其垂直对齐
  const menu = uni.getMenuButtonBoundingClientRect();
  menuInset.value = info.windowWidth - menu.left;
  menuTop.value = menu.top;
  menuHeight.value = menu.height;
  // #endif

  return { statusBarHeight, menuInset, menuTop, menuHeight };
}
