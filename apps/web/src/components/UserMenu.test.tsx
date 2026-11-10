/**
 * 顶栏用户菜单：头像 + 用户名，团队切换收在二级菜单里
 *
 * 钉住三条约束：
 * 1. 触发器只显示用户，不把团队名搬到顶栏
 * 2. 单租户仍在下拉里展示当前团队名与角色（不可点的展示项，无二级菜单）
 * 3. 多租户的团队列表在二级菜单里，未展开时不进 DOM；当前项用 visibility 占位保持左对齐
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App as AntdApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTenantStore } from '@/stores/tenant';

vi.mock('@/stores/auth', () => ({
  useAuthStore: (selector: (s: { user: unknown }) => unknown) =>
    selector({ user: { id: 'u_1', name: '陈明', avatarUrl: null } }),
}));
vi.mock('@/hooks/useLogout', () => ({ useLogout: () => vi.fn() }));

import { UserMenu } from './UserMenu';

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

function renderMenu() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/resources']}>
        <AntdApp>
          <UserMenu />
        </AntdApp>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** 悬停触发器打开下拉（antd Dropdown 默认 hover 触发） */
const openMenu = () => fireEvent.mouseEnter(screen.getByText('陈明'));

describe('UserMenu 团队切换', () => {
  beforeEach(() => {
    useTenantStore.setState({ tenants: [], currentTenantId: null, tenantsLoaded: false });
  });

  it('触发器展示用户名而不是团队名', () => {
    useTenantStore.setState({ tenants: TENANTS, currentTenantId: 't_1', tenantsLoaded: true });

    renderMenu();

    expect(screen.getByText('陈明')).toBeInTheDocument();
    expect(screen.queryByText('星河科技')).not.toBeInTheDocument();
  });

  it('单租户：下拉里展示团队名与角色，但没有可展开的二级菜单', async () => {
    useTenantStore.setState({
      tenants: [TENANTS[0]],
      currentTenantId: 't_1',
      tenantsLoaded: true,
    });

    const { container } = renderMenu();
    openMenu();

    expect(await screen.findByText('退出登录')).toBeInTheDocument();
    // 团队名与角色仍在，用户能确认自己身在哪个团队
    expect(screen.getByText('星河科技')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    // Dropdown 内的菜单前缀是 ant-dropdown-menu（不是 ant-menu）
    expect(container.ownerDocument.querySelectorAll('.ant-dropdown-menu-submenu')).toHaveLength(0);
  });

  it('多租户：当前团队是二级菜单标题，展开后才列出全部团队', async () => {
    useTenantStore.setState({ tenants: TENANTS, currentTenantId: 't_1', tenantsLoaded: true });

    const { container } = renderMenu();
    openMenu();

    // 一级只暴露「当前团队」，其他团队不在 DOM 里
    expect(await screen.findByText('星河科技')).toBeInTheDocument();
    expect(screen.queryByText('远山设计')).not.toBeInTheDocument();
    expect(container.ownerDocument.querySelectorAll('.ant-dropdown-menu-submenu')).toHaveLength(1);

    fireEvent.mouseEnter(screen.getByText('星河科技'));

    expect(await screen.findByText('远山设计')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('成员')).toBeInTheDocument();
    // 二级面板限高 300px 且内部滚动：团队很多时不能把屏幕顶穿
    const popup = container.ownerDocument.querySelector<HTMLElement>(
      '.ant-dropdown-menu-submenu-popup',
    );
    expect(popup?.style.maxHeight).toBe('300px');
    expect(popup?.style.overflowY).toBe('auto');
    // 勾只对当前团队可见
    const checks = Array.from(container.ownerDocument.querySelectorAll('.anticon-check'));
    expect(checks.filter((el) => (el as HTMLElement).style.visibility !== 'hidden')).toHaveLength(
      1,
    );
  });
});
