import { Request } from 'express';

/**
 * access token 的载荷。
 *
 * 有意不含 tenantId：一个用户可属多个租户，把租户写进令牌会导致「切租户必须换令牌」。
 * 租户上下文改为请求级传递（前端带 X-Tenant-Id 头，守卫另做 membership 校验），
 * 因此登录响应和 /auth/me 都不返回租户信息。见功能方案 01 §4.3。
 */
export interface JwtPayload {
  /** 用户 id，对应 users.id（JWT 规范里 subject 的缩写，固定叫 sub） */
  sub: string;
  /** 令牌类型。refresh 与 access 用同一把密钥签，必须靠它区分，防止 refresh 冒充 access */
  type: 'access';
}

/**
 * 经过 JwtAuthGuard 之后的请求对象。
 * 守卫负责填充 user，所以进到 controller 时它必定非空 —— 这里声明为非可选，
 * 避免每个 handler 都写 `req.user?.` 这种永远为真的判空。
 */
export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
  /** TenantGuard 校验通过后写入：当前用户在该租户的角色（RBAC 用，Step 8.3） */
  userRole?: string;
}
