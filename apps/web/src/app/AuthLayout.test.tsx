/**
 * AuthLayout 布局结构验证（jsdom）
 *
 * 设计稿 S2 要求（layout=side + 顶栏横带）：
 * - 侧栏：logo + 标题（与菜单同宽 208）+ 菜单；不包含搜索/头像
 * - 顶栏：面包屑 + 搜索框 + 铃铛 + 头像（ProLayout children 内自绘），
 *   高度 56 与侧栏 logo 区对齐（content padding 归零后贴顶满宽）
 * - showTopbar=false 时整体关闭顶栏
 * side 布局下 ProLayout 默认把 actions/头像渲染进侧栏，故用 DOM 断言防回归。
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App as AntdApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/stores/auth', () => ({
  useAuthStore: (selector: (s: { user: unknown }) => unknown) =>
    selector({ user: { id: 'u_1', name: '陈明', avatarUrl: null } }),
}));
vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ can: () => true, role: 'owner' }),
}));
vi.mock('@/hooks/useLogout', () => ({ useLogout: () => vi.fn() }));
vi.mock('./useTenantRouting', () => ({ useTenantRouting: () => undefined }));

import { AuthLayout } from './AuthLayout';

function renderLayout(props: { showTopBar?: boolean } = {}, initialEntries: string[] = ['/app']) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <AntdApp>
          <AuthLayout {...props} />
        </AntdApp>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AuthLayout 布局（side + 顶栏横带）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('侧栏渲染 logo + 标题与菜单（占位菜单不再 disabled）', async () => {
    const { container } = renderLayout();
    expect(await screen.findByText('SaaS Starter')).toBeInTheDocument();
    // 面包屑也叫「工作台」，菜单断言取集合非空即可
    expect((await screen.findAllByText('工作台')).length).toBeGreaterThan(0);
    // 原禁用占位项（成员管理）现在应渲染为可点击菜单
    expect(await screen.findByText('成员管理')).toBeInTheDocument();
    // 资源详情等子路由全部 hideInMenu：不应渲染出空 submenu（子菜单展示控制）
    expect(container.querySelectorAll('.ant-menu-submenu')).toHaveLength(0);
  });

  it('详情子路由归属「资源列表」菜单高亮（matchPath 按路由树匹配）', async () => {
    const { container } = renderLayout({}, ['/app/resources/abc123']);
    await screen.findByText('SaaS Starter');
    const selected = container.querySelector('.ant-menu-item-selected');
    expect(selected).toHaveTextContent('资源列表');
  });

  it('顶栏默认渲染：含面包屑/搜索/头像，高 56，不落入侧栏', async () => {
    const { container } = renderLayout();
    expect(await screen.findByText('首页')).toBeInTheDocument();
    const search = screen.getByPlaceholderText('搜索资源、成员…');
    const avatar = screen.getByText('陈');

    const bar = container.querySelector('header');
    expect(bar).not.toBeNull();
    expect(bar).toContainElement(screen.getByText('首页'));
    expect(bar).toContainElement(search);
    expect(bar).toContainElement(avatar);
    // 高度 56（h-14，jsdom 不加载 Tailwind 编译产物，断言类名而非计算样式）
    expect(bar?.className).toContain('h-14');

    // 侧栏不得包含搜索/头像（side 布局曾把它们渲染进侧栏底部）
    const sider = container.querySelector('.ant-pro-sider');
    expect(sider).not.toBeNull();
    expect(sider).not.toContainElement(search);
    expect(sider).not.toContainElement(avatar);

    // 对齐保障：顶栏必须是 content 容器（ant-pro-layout-content）的直接子元素、
    // 贴顶渲染。content 曾继承 pageContainer token 的 24px padding 把顶栏顶下来，
    // 与侧栏 logo 区（56px 横带）错位——token 已归零，此处防回归。
    const content = container.querySelector('.ant-pro-layout-content');
    expect(content).not.toBeNull();
    expect(content).toContainElement(bar as HTMLElement);
    expect((bar as HTMLElement).parentElement).toBe(content);
    expect((bar as HTMLElement).previousElementSibling).toBeNull();
  });

  it('showTopBar=false 时不渲染顶栏，侧栏正常', async () => {
    const { container } = renderLayout({ showTopBar: false });
    expect(await screen.findByText('SaaS Starter')).toBeInTheDocument();
    expect(container.querySelector('header')).toBeNull();
    expect(screen.queryByPlaceholderText('搜索资源、成员…')).not.toBeInTheDocument();
  });
});
