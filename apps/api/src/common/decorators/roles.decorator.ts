import { SetMetadata } from '@nestjs/common';
import { Role } from '@saas/shared';

/** 角色元数据键，RolesGuard 读同一常量，避免两处字符串不同步 */
export const ROLES_KEY = 'roles';

/**
 * 声明「允许访问该接口的角色」，多个角色是「或」的关系。params 为空数组等同于没限制。
 *
 * 语义方向与 @Public() 相反，这点最容易搞混：
 *   @Public()  = 默认拦截，逐个放行（要跳 JwtAuthGuard 必须显式标）
 *   @Roles()   = 默认放行，逐个收紧（只有要限制的接口才标）
 *
 * 为什么反着设计：绝大多数接口普通成员就能访问，如果要求每个接口都标角色，
 * 漏标就从「越权」变成「全站 403」，故障面反而更大。
 *
 * ⚠️ 它不查库。RolesGuard 只读 TenantGuard 写好的 req.userRole，
 *    所以 @Roles 必须与租户上下文共存 —— 千万别和 @SkipTenant() 标在同一个接口上，
 *    那样 userRole 是 undefined，RBAC 会一律拒绝（这是刻意的 fail-closed）。
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
