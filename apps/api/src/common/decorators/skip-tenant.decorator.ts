import { SetMetadata } from '@nestjs/common';

/** 跳过租户上下文的元数据键，TenantGuard 读同一常量 */
export const SKIP_TENANT_KEY = 'skipTenant';

/**
 * 让接口不要求 X-Tenant-Id 头，也不查 membership。
 *
 * ⚠️ 它和 @Public() 是两道独立的闸，不能互相替代 —— 这是 03 踩过的坑：
 *   @Public()      → 只跳过 JwtAuthGuard（不要求登录）
 *   @SkipTenant()  → 只跳过 TenantGuard（不要求租户上下文）
 *   守卫链是 Throttler → JwtAuth → Tenant → Roles，每个守卫只认自己那个键。
 *
 * 两种组合，别搞反：
 *   @Public + @SkipTenant  → 探活类，既不要 token 也不要租户头（/health、/health/db）
 *   仅 @SkipTenant         → 需要登录但还没选定租户（/auth/me、/tenants 列表）
 *
 * 只标 @Public 漏标本装饰器的后果：探活请求被 TenantGuard 403，
 * 负载均衡判定实例不健康、反复重启 —— 典型的「服务其实活着，但被踢出集群」。
 * 该回归用例在 tenant.guard.spec.ts 里（「标了 @SkipTenant → 直接放行」）。
 */
export const SkipTenant = () => SetMetadata(SKIP_TENANT_KEY, true);
