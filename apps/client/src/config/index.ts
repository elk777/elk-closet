/**
 * 前端运行时配置。
 *
 * 开发阶段 API 基址写死为本机后端（端口 3100，与后端 .env.development 对齐）。
 * 用局域网 IP 而非 localhost：真机调试时请求由手机发出，localhost 会指向手机自己。
 * IP 随 Wi-Fi 变化，联调前用 `ipconfig getifaddr en0` 核对，并与后端监听地址保持一致。
 * 上线前改成真实备案域名即可（小程序要求 HTTPS + 已备案域名）。
 */

/** 后端 API 基址（含统一前缀 /api） */
export const API_BASE_URL = 'http://192.168.31.28:3100/api';

/** 单次请求超时（毫秒），与后端 AI 识别超时留出余量 */
export const REQUEST_TIMEOUT = 60000;
