import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App as AntdApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listTenants } from '@/shared/api/tenants';
import { SelectTenant } from './index';

vi.mock('@/shared/api/tenants', () => ({ listTenants: vi.fn() }));
vi.mock('@/shared/api/auth', () => ({ authApi: { logout: vi.fn() } }));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/select-tenant']}>
        <AntdApp>
          <SelectTenant />
        </AntdApp>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SelectTenant', () => {
  beforeEach(() => {
    vi.mocked(listTenants).mockReset();
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

  it('一个团队都没有时给空态而不是报错（成员被移出所有团队是合法状态）', async () => {
    vi.mocked(listTenants).mockResolvedValue({ items: [] });

    renderPage();

    expect(await screen.findByText('还没有加入任何团队')).toBeInTheDocument();
    expect(screen.getByText('请联系团队管理员把你加入团队后再试')).toBeInTheDocument();
  });
});
