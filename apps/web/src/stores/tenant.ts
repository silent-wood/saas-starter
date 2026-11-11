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
  /**
   * 刚因 `403 TENANT_MISMATCH` 失去当前团队（被 owner/admin 移除或禁用）。
   *
   * 请求层只负责置位，提示由落点层（`useTenantRouting`）消费一次后清除：
   * 拦截器里拿不到 antd 的 message 上下文，直接调用静态 message 会丢主题与
   * App 包裹下的样式，且并发 403 会连弹多条。
   */
  removedNotice: boolean;
  setTenants: (list: TenantListItem[]) => void;
  setCurrent: (id: string) => void;
  clearCurrent: () => void;
  markRemoved: () => void;
  clearRemovedNotice: () => void;
  clear: () => void;
}

export const useTenantStore = create<TenantState>()(
  persist(
    (set) => ({
      tenants: [],
      currentTenantId: null,
      tenantsLoaded: false,
      removedNotice: false,
      setTenants: (tenants) => set({ tenants, tenantsLoaded: true }),
      setCurrent: (currentTenantId) => set({ currentTenantId }),
      clearCurrent: () => set({ currentTenantId: null }),
      markRemoved: () => set({ removedNotice: true }),
      clearRemovedNotice: () => set({ removedNotice: false }),
      clear: () =>
        set({ tenants: [], currentTenantId: null, tenantsLoaded: false, removedNotice: false }),
    }),
    {
      name: 'saas.tenant',
      // removedNotice 同样不持久化：刷新页面后「刚被移除」这件事已经过期，
      // 重新拉一次列表就能得到真相
      partialize: (s) => ({ currentTenantId: s.currentTenantId }),
    },
  ),
);
