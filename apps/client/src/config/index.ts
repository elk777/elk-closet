/**
 * 前端运行时配置。
 *
 * 两端基址策略不同：
 * - H5 与后端同域部署（Nginx 反代 /api），用相对路径即可。好处是同源，
 *   没有 CORS 问题，换域名也不用改代码
 * - 小程序不受同源策略约束但要 HTTPS + 已备案域名，必须写绝对地址。
 *   开发期用局域网 IP 或内网穿透：真机调试时请求由手机发出，localhost
 *   会指向手机自己。联调前用 `ipconfig getifaddr en0` 核对 IP 是否变化
 *
 * 这里用运行时判断而非条件编译：条件编译会留下两个 `export const API_BASE_URL`
 * 声明，vue-tsc 不认 `// #ifdef` 这类注释指令，会报重复声明。
 * 代价是 H5 包里多一个小程序地址字符串常量，可忽略。
 */

/** 小程序端后端地址：本地联调走内网穿透，上线前替换为备案域名 */
const MP_API_BASE_URL = 'http://a666afd6.natappfree.cc/api';

/**
 * 当前是否运行在 H5。
 * 用 uni 暴露的编译期常量判断，而非 `typeof window`——后者在 SSR 或
 * 小程序模拟环境里不可靠。
 */
function isH5(): boolean {
  // #ifdef H5
  return true;
  // #endif
  // #ifndef H5
  return false;
  // #endif
}

/**
 * 后端 API 基址（含统一前缀 /api）。
 *
 * H5 用相对路径 `/api`，由 Nginx 反代到后端；小程序用绝对地址。
 */
export const API_BASE_URL = isH5() ? '/api' : MP_API_BASE_URL;

/** 单次请求超时（毫秒），与后端 AI 识别超时留出余量 */
export const REQUEST_TIMEOUT = 60000;