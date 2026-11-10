/**
 * 工作台测试（S2）
 * 覆盖：最近资源渲染 / 失败态 Alert + 重试 / 权限口径（member 不渲染新建按钮）
 */
import { render, screen } from '@testing-library/react';
import { App as AntdApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResourceItem } from '@saas/shared';
import { resourceApi } from '@/shared/api/resource';
import Dashboard from './page';

vi.mock('@/shared/api/resource', () => ({ resourceApi: { list: vi.fn() } }));

const item = (n: number): ResourceItem =>
  ({
    id: `r_${n}`,
    name: `需求文档 ${n}`,
    category: 'doc',
    createdAt: '2026-11-08T10:00:00.000Z',
    updatedAt: '2026-11-09T08:30:00.000Z',
  }) as ResourceItem;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AntdApp>
          <Dashboard />
        </AntdApp>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.mocked(resourceApi.list).mockReset();
  });

  it('渲染最近资源列表与「查看全部」入口', async () => {
    vi.mocked(resourceApi.list).mockResolvedValue({
      items: [item(1), item(2)],
      total: 2,
      page: 1,
      pageSize: 3,
    });

    renderPage();

    expect(await screen.findByText('需求文档 1')).toBeInTheDocument();
    expect(screen.getByText('需求文档 2')).toBeInTheDocument();
    expect(screen.getByText('查看全部')).toBeInTheDocument();
  });

  it('无资源时展示空态引导（member 无新建按钮）', async () => {
    vi.mocked(resourceApi.list).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 3,
    });

    renderPage();

    expect(await screen.findByText('还没有资源')).toBeInTheDocument();
    // 未选定租户（member/未知角色）不渲染「新建资源」主按钮
    expect(screen.queryByText('新建资源')).not.toBeInTheDocument();
  });

  it('加载失败显示卡片内 Alert 与重试按钮', async () => {
    vi.mocked(resourceApi.list).mockRejectedValue(new Error('boom'));

    renderPage();

    expect(await screen.findByText('最近资源加载失败')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重 试|重试/ })).toBeInTheDocument();
  });
});
