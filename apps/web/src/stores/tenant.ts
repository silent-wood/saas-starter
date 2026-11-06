import type { TenantListItem } from '@saas/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
interface TenantState {
  tenants: TenantListItem[];
  currentTenantId: string | null;
  setTenants: (list: TenantListItem[]) => void;
  setCurrent: (id: string) => void;
  clear: () => void;
}

export const useTenantStore = create<TenantState>()(
  persist(
    (set) => ({
      tenants: [],
      currentTenantId: null,
      setTenants: (tenants) => set({ tenants }),
      setCurrent: (currentTenantId) => set({ currentTenantId }),
      clear: () => set({ tenants: [], currentTenantId: null }),
    }),
    {
      name: 'saas.tenant',
      partialize: (s) => ({ currentTenantId: s.currentTenantId }),
    },
  ),
);
