import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { App as AntdApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTenant, listTenants } from '@/shared/api/tenants';
import { useTenantStore } from '@/stores/tenant';
import { SelectTenant } from './page';

vi.mock('@/shared/api/tenants', () => ({ listTenants: vi.fn(), createTenant: vi.fn() }));
vi.mock('@/shared/api/auth', () => ({ authApi: { logout: vi.fn() } }));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/select-tenant']}>
        <AntdApp>
          <Routes>
            <Route path="/select-tenant" element={<SelectTenant />} />
            {/* 创建成功后要落到工作台，放一个占位路由断言跳转 */}
            <Route path="/app" element={<div>工作台</div>} />
          </Routes>
        </AntdApp>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SelectTenant', () => {
  beforeEach(() => {
    vi.mocked(listTenants).mockReset();
    vi.mocked(createTenant).mockReset();
    useTenantStore.setState({
      tenants: [],
      currentTenantId: null,
      tenantsLoaded: false,
      removedNotice: false,
    });
  });

  it('列出用户所属的团队，并显示其在各团队里的角色', async () => {
    vi.mocked(listTenants).mockResolvedValue({
      items: [
        { id: 't_1', name: '星河科技', role: 'owner', status: 'active', lastActiveAt: null },
        { id: 't_2', name: '北斗实验室', role: 'member', status: 'active', lastActiveAt: null },
      ],
    });

    renderPage();

    expect(await screen.findByText('星河科技')).toBeInTheDocument();
    expect(screen.getByText('北斗实验室')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('成员')).toBeInTheDocument();
    expect(screen.getByText('选择团队')).toBeInTheDocument();
  });

  it('一个团队都没有时给创建入口（被移出所有团队后的自救路径）', async () => {
    vi.mocked(listTenants).mockResolvedValue({ items: [] });

    renderPage();

    expect(await screen.findByText('还没有加入任何团队')).toBeInTheDocument();
    expect(
      screen.getByText('创建一个新团队开始协作，或通过管理员发来的邀请链接加入'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('团队名称')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '创建团队' })).toBeInTheDocument();
  });

  it('无团队时创建成功后写入 store 并进入工作台', async () => {
    vi.mocked(listTenants).mockResolvedValue({ items: [] });
    vi.mocked(createTenant).mockResolvedValue({
      id: 't_9',
      name: '新团队',
      role: 'owner',
      status: 'active',
      lastActiveAt: null,
    });

    renderPage();

    const input = await screen.findByLabelText('团队名称');
    fireEvent.change(input, { target: { value: '新团队' } });
    fireEvent.click(screen.getByRole('button', { name: '创建团队' }));

    expect(await screen.findByText('工作台')).toBeInTheDocument();
    // react-query 的 mutationFn 会多传一个上下文参数，只断言第一个入参
    expect(vi.mocked(createTenant).mock.calls[0][0]).toEqual({ name: '新团队' });
    // 新团队要立刻成为当前上下文，否则进 /app 后仍是没有租户的状态
    expect(useTenantStore.getState().currentTenantId).toBe('t_9');
    expect(useTenantStore.getState().tenants.map((t) => t.id)).toEqual(['t_9']);
  });

  it('名称太短不发请求（与契约的 2 字下限同源）', async () => {
    vi.mocked(listTenants).mockResolvedValue({ items: [] });

    renderPage();

    fireEvent.change(await screen.findByLabelText('团队名称'), { target: { value: 'A' } });
    fireEvent.click(screen.getByRole('button', { name: '创建团队' }));

    expect(createTenant).not.toHaveBeenCalled();
  });
});
