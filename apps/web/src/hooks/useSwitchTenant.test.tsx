/**
 * 切换租户的核心行为：缓存不能串数据
 *
 * 这里测的是最容易出事故的部分 —— 切换后旧租户的查询必须真的消失，而租户列表
 * 本身要留下（它与当前租户无关，清掉会让菜单与权限闪一下）。
 */
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTenantStore } from '@/stores/tenant';
import { tenantLanding, useSwitchTenant } from './useSwitchTenant';

const TENANTS = [
  {
    id: 't_1',
    name: '星河科技',
    role: 'owner' as const,
    status: 'active' as const,
    lastActiveAt: null,
  },
  {
    id: 't_2',
    name: '远山设计',
    role: 'member' as const,
    status: 'active' as const,
    lastActiveAt: null,
  },
];

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useSwitchTenant(), { wrapper });
  return { queryClient, switchTo: result };
}

describe('useSwitchTenant', () => {
  beforeEach(() => {
    useTenantStore.setState({ tenants: TENANTS, currentTenantId: 't_1', tenantsLoaded: true });
  });

  it('切换后清掉业务缓存，但保留租户列表', async () => {
    const { queryClient, switchTo } = setup();
    queryClient.setQueryData(['resource', 'r_1'], { id: 'r_1', name: '旧租户的资源' });
    queryClient.setQueryData(['resource-list', { page: 1 }], { items: [] });
    queryClient.setQueryData(['tenants'], { items: TENANTS });

    await act(() => switchTo.current('t_2'));

    expect(useTenantStore.getState().currentTenantId).toBe('t_2');
    // 旧数据必须彻底消失：invalidate 只标记过期，组件仍会渲染旧值
    expect(queryClient.getQueryData(['resource', 'r_1'])).toBeUndefined();
    expect(queryClient.getQueryData(['resource-list', { page: 1 }])).toBeUndefined();
    // 租户列表与当前租户无关，清掉会让菜单和权限闪一下
    expect(queryClient.getQueryData(['tenants'])).toBeDefined();
  });

  it('点击当前租户是空操作：不重写状态也不清缓存', async () => {
    const { queryClient, switchTo } = setup();
    queryClient.setQueryData(['resource', 'r_1'], { id: 'r_1' });

    await act(() => switchTo.current('t_1'));

    expect(queryClient.getQueryData(['resource', 'r_1'])).toBeDefined();
  });
});

describe('tenantLanding', () => {
  it('动态段退回菜单归属页（跨租户的 id 在新租户里几乎必然不存在）', () => {
    expect(tenantLanding('/app/resources/r_1')).toBe('/app/resources');
  });

  it('静态路径原地不动，无权限由路由守卫原地渲染 403', () => {
    expect(tenantLanding('/app')).toBeNull();
    expect(tenantLanding('/app/trash')).toBeNull();
    expect(tenantLanding('/app/resources')).toBeNull();
  });
});
