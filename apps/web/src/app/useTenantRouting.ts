import { listTenants } from '@/shared/api/tenants';
import { useTenantStore } from '@/stores/tenant';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';

export function useTenantRouting() {
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ['tenants'], queryFn: listTenants });
  const current = useTenantStore((s) => s.currentTenantId);

  useEffect(() => {
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
  }, [data, current, navigate]);
}
