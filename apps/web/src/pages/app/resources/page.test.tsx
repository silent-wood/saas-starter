/**
 * 资源列表页测试（07 方案 §3.2 验收口径）
 * 覆盖：member 不渲染新建按钮、删除确认后调用接口、空态引导
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App as AntdApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resourceApi } from '@/shared/api/resource';
import { useTenantStore } from '@/stores/tenant';
import { ResourceListPage } from './page';

vi.mock('@/shared/api/resource', () => ({
  resourceApi: {
    list: vi.fn(),
    remove: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    detail: vi.fn(),
    trashList: vi.fn(),
    restore: vi.fn(),
    purge: vi.fn(),
  },
}));

const item = {
  id: 'r_1',
  name: '产品需求清单 v3',
  description: null,
  category: '文档',
  createdBy: 'u_1',
  createdByName: '李顺',
  createdAt: '2026-11-09T00:00:00.000Z',
  updatedAt: '2026-11-09T00:00:00.000Z',
};

function setRole(role: 'owner' | 'member') {
  useTenantStore.setState({
    currentTenantId: 't_1',
    tenants: [{ id: 't_1', name: '星河科技', role, status: 'active', lastActiveAt: null }],
  });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/resources']}>
        <AntdApp>
          <ResourceListPage />
        </AntdApp>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ResourceListPage', () => {
  beforeEach(() => {
    vi.mocked(resourceApi.list).mockReset();
    vi.mocked(resourceApi.remove).mockReset();
    setRole('owner');
  });

  it('member 不渲染新建按钮，操作列只有查看', async () => {
    setRole('member');
    vi.mocked(resourceApi.list).mockResolvedValue({
      items: [item],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    renderPage();

    expect(await screen.findByText('产品需求清单 v3')).toBeInTheDocument();
    expect(screen.queryByText('新建资源')).not.toBeInTheDocument();
    expect(screen.getByText('查看')).toBeInTheDocument();
    expect(screen.queryByText('编辑')).not.toBeInTheDocument();
    expect(screen.queryByText('删除')).not.toBeInTheDocument();
  });

  it('删除确认后调用软删除接口并刷新列表', async () => {
    vi.mocked(resourceApi.list).mockResolvedValue({
      items: [item],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    vi.mocked(resourceApi.remove).mockResolvedValue(item);

    renderPage();
    await screen.findByText('产品需求清单 v3');

    // 行内「删除」是链接，确认弹窗的「删除」是按钮，用 role 区分；
    // antd 会对两字按钮自动插入空格（「删 除」），断言用正则兼容
    fireEvent.click(screen.getByText('删除'));
    fireEvent.click(await screen.findByRole('button', { name: /^删\s*除$/ }));

    await waitFor(() => {
      expect(resourceApi.remove).toHaveBeenCalledWith('r_1');
    });
    expect(await screen.findByText('已移入回收站')).toBeInTheDocument();
  });

  it('空列表渲染引导空态', async () => {
    vi.mocked(resourceApi.list).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

    renderPage();

    expect(await screen.findByText('还没有资源')).toBeInTheDocument();
    expect(screen.getByText('创建第一个资源')).toBeInTheDocument();
  });
});
