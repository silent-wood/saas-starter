import type { TenantListItem } from '@saas/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
interface TenantState {
  tenants: TenantListItem[];
  currentTenantId: string | null;
  /**
   * 租户列表是否已得出结论（成功或失败都算）。
   *
   * 角色只挂在列表项上，列表没到之前无法判断权限；路由守卫若此时就下结论，
   * 会把有权限的用户误判成 403。所以「未知」必须是独立状态，不能和「空列表」混为一谈。
   * 该字段不持久化：刷新后必须重新拉取才能确认，沿用旧的 true 只会拿到过期角色。
   */
  tenantsLoaded: boolean;
  setTenants: (list: TenantListItem[]) => void;
  setCurrent: (id: string) => void;
  clear: () => void;
}

export const useTenantStore = create<TenantState>()(
  persist(
    (set) => ({
      tenants: [],
      currentTenantId: null,
      tenantsLoaded: false,
      setTenants: (tenants) => set({ tenants, tenantsLoaded: true }),
      setCurrent: (currentTenantId) => set({ currentTenantId }),
      clear: () => set({ tenants: [], currentTenantId: null, tenantsLoaded: false }),
    }),
    {
      name: 'saas.tenant',
      partialize: (s) => ({ currentTenantId: s.currentTenantId }),
    },
  ),
);
