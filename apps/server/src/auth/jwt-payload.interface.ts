/**
 * JWT 载荷：token 里携带的用户身份。
 *
 * 只放内部主键 sub（subject），不塞敏感信息——
 * token 可能被前端存储/传输，最小化泄露面。
 * 用户其余信息由 JwtAuthGuard 凭 sub 实时查库拿到。
 */
export interface JwtPayload {
  /** 用户内部主键（标准 JWT subject 字段） */
  sub: string;
}
