/**
 * 统一轻提示。
 *
 * 封装 uni.showToast，统一成功/错误/普通三种语义，
 * 页面与请求器都经此提示，文案风格一致（呼应 PRD 5.6 用户可见反馈）。
 */

export function useToast() {
  /** 错误提示（无图标，红字场景由文案承载） */
  function error(title: string): void {
    uni.showToast({ title, icon: 'none', duration: 2500 });
  }

  /** 成功提示 */
  function success(title: string): void {
    uni.showToast({ title, icon: 'success', duration: 1500 });
  }

  /** 普通提示 */
  function info(title: string): void {
    uni.showToast({ title, icon: 'none', duration: 2000 });
  }

  return { error, success, info };
}
