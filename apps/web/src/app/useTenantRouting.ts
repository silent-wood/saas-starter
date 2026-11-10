import { listTenants } from '@/shared/api/tenants';
import { useTenantStore } from '@/stores/tenant';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';

export function useTenantRouting() {
  const navigate = useNavigate();
  const { data, isError } = useQuery({ queryKey: ['tenants'], queryFn: listTenants });
  const current = useTenantStore((s) => s.currentTenantId);

  useEffect(() => {
    // 拉取失败同样要给出结论：否则 tenantsLoaded 永远为 false，权限守卫会一直停在
    // 加载态（比误判 403 更难排查）。按「没有租户」落定，由守卫渲染 403。
    if (isError) {
      useTenantStore.getState().setTenants([]);
      return;
    }
    if (!data) return;
    const { items } = data;
    useTenantStore.getState().setTenants(items);

    if (items.length === 0) return;
    if (items.length === 1) {
      if (current !== items[0].id) useTenantStore.getState().setCurrent(items[0].id);
      return;
    }
    const valid = items.some((t) => t.id === current);
    if (!valid) navigate('/select-tenant', { replace: true });
  }, [data, isError, current, navigate]);
}
