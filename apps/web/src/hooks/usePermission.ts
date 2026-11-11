/**
 * 权限派生 hook（07 方案 §3.2，v1.2）
 *
 * tenant store 没有独立的 role 字段：当前用户在当前租户里的角色挂在
 * `tenants` 列表项上（`GET /tenants` 返回 memberships.role）。这里派生读取，
 * 不扩展 store —— 单一天然数据源，切换租户时角色自动跟随，无双重状态。
 *
 * useTenantRouting 在 AuthLayout 层已把 tenants 写入 store，/app 下所有页面
 * 都能拿到。注意 `ready` 与 `can()` 的区别：列表未就绪时 role 为 null、can() 恒为
 * false，这适合「先隐藏菜单入口」；一旦拿它拦路由，刷新瞬间就会把有权限的用户
 * 判成 403 —— 所以拦路由必须同时判断 ready。
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
  const ready = useTenantStore((s) => s.tenantsLoaded);
  return useMemo(
    () => ({
      role,
      /** 角色是否已可判定。false 表示租户列表还没落地，此时 can() 的结果无意义 */
      ready,
      can: (permission: Permission) => role !== null && canDo(role, permission),
    }),
    [role, ready],
  );
}
