/**
 * 统一 API 响应契约（前后端共享，单一事实来源）。
 *
 * 后端所有响应经拦截器包成 ApiResponse<T>，异常经过滤器包成同一结构，
 * 前端据此统一解包与错误处理——成功看 data，失败看 code/message，格式恒定。
 *
 * 为什么共享：前端解包逻辑与后端包裹逻辑必须对齐，放一处避免两边漂移。
 */

/** 成功响应：code 恒为 0，data 携带业务数据 */
export interface ApiSuccess<T> {
  /** 0 表示成功 */
  code: 0;
  /** 业务数据 */
  data: T;
  /** 服务端时间（ISO 串），便于前端校时与调试 */
  timestamp: string;
}

/** 失败响应：code 非 0，message 为用户可见提示（PRD 5.6 每个异常有反馈） */
export interface ApiError {
  /** 非 0 错误码：当前用 HTTP 状态码，将来可扩展业务错误码 */
  code: number;
  /** 用户可见的错误提示 */
  message: string;
  /** 请求路径，便于排查 */
  path: string;
  /** 服务端时间（ISO 串） */
  timestamp: string;
}

/** 统一响应联合类型 */
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/** 成功响应的判定（前端解包用）：窄化到 ApiSuccess */
export function isApiSuccess<T>(res: ApiResponse<T>): res is ApiSuccess<T> {
  return res.code === 0;
}
