/**
 * useLocation：取当前经纬度，供今日推荐按位置取天气。
 *
 * 现实约束：小程序 wx.getLocation 需在管理后台申请「地理位置」接口权限（要资质审核），
 * 开发期或用户拒绝授权时都拿不到坐标。故本 composable 失败一律静默返回 null——
 * 后端会退回兜底城市取天气，推荐链路不因定位缺失而中断。
 */

/** 经纬度坐标 */
export interface Coords {
  lon: number;
  lat: number;
}

/**
 * 取当前坐标。
 * @returns 成功返回坐标；未授权 / 无资质 / 失败返回 null（后端用兜底城市）
 */
export function getCoords(): Promise<Coords | null> {
  return new Promise((resolve) => {
    uni.getLocation({
      type: 'wgs84',
      success: (res) => resolve({ lon: res.longitude, lat: res.latitude }),
      // 拒绝授权 / 接口未开通 / 定位失败：静默降级，不打扰用户
      fail: () => resolve(null),
    });
  });
}
