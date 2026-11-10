/**
 * 权限派生 hook（07 方案 §3.2，v1.2）
 *
 * tenant store 没有独立的 role 字段：当前用户在当前租户里的角色挂在
 * `tenants` 列表项上（`GET /tenants` 返回 memberships.role）。这里派生读取，
 * 不扩展 store —— 单一天然数据源，切换租户时角色自动跟随，无双重状态。
 *
 * useTenantRouting 在 AuthLayout 层已把 tenants 写入 store，/app 下所有页面
 * 都能拿到；tenants 未就绪时 role 为 null，can() 返回 false（先隐藏入口）。
 */
import { useMemo } from 'react';
import type { Permission, Role } from '@saas/shared';
import { canDo } from '@saas/shared';
import { useTenantStore } from '@/stores/tenant';

export function useCurrentRole(): Role | null {
  const currentTenantId = useTenantStore((s) => s.currentTenantId);
  const tenants = useTenantStore((s) => s.tenants);
  return tenants.find((t) => t.id === currentTenantId)?.role ?? null;
}

export function usePermission() {
  const role = useCurrentRole();
  return useMemo(
    () => ({
      role,
      can: (permission: Permission) => role !== null && canDo(role, permission),
    }),
    [role],
  );
}
