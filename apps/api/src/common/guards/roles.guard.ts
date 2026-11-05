import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator.ts';
import { ERROR_CODES, type Role } from '@saas/shared';
import { AuthenticatedRequest } from '../types/authenticated-request.ts';

/**
 * 角色守卫：按 @Roles() 声明的白名单，校验当前用户在该租户的角色。
 *
 * 位置在守卫链末位（Throttler → JwtAuth → Tenant → Roles），顺序不能挪：
 *   它读 req.userRole，而这个字段是 TenantGuard 查完 membership 才写上的。
 *   排到 TenantGuard 前面就会读到 undefined，所有标了 @Roles 的接口一律 403。
 *
 * 刻意不查库：一个请求里 membership 只查一次（TenantGuard 那次），此处复用结果。
 * 代价是 userRole 只反映「请求开始那一刻」的角色，处理途中被降级不会即时生效 ——
 * 对 RBAC 而言这个窗口可接受，换来的是每请求少一次 5–20ms 的远程查询。
 *
 * 默认放行：没标 @Roles 的接口直接 return true，语义见 roles.decorator.ts。
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    // getAllAndOverride：方法级优先于类级 —— @Roles 标在 handler 上时以此为准，
    // 标在 controller 上则作用于该控制器全部接口
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    if (!required?.length) return true;

    // 不查库：userRole 由 TenantGuard 写好，避免每个请求两次 membership 查询
    const { userRole } = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    // userRole 为空说明接口漏了租户上下文（如误标 @SkipTenant），仍按拒绝处理
    if (!userRole || !required.includes(userRole)) {
      throw new ForbiddenException({
        code: ERROR_CODES.ROLE_DENIED,
        message: '当前角色无权执行该操作',
      });
    }
    return true;
  }
}
