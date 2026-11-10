/**
 * 资源详情页测试：正常渲染字段、404 空态（软删 / 跨租户统一 404 口径）
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { App as AntdApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resourceApi } from '@/shared/api/resource';
import { useTenantStore } from '@/stores/tenant';
import ResourceDetail from './page';

vi.mock('@/shared/api/resource', () => ({
  resourceApi: {
    detail: vi.fn(),
    remove: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    list: vi.fn(),
    trashList: vi.fn(),
    restore: vi.fn(),
    purge: vi.fn(),
  },
}));

const item = {
  id: 'r_1',
  name: '产品需求清单 v3',
  description: '本季度需求汇总',
  category: '文档',
  createdBy: 'u_1',
  createdByName: '李顺',
  createdAt: '2026-11-09T00:00:00.000Z',
  updatedAt: '2026-11-09T00:00:00.000Z',
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useTenantStore.setState({
    currentTenantId: 't_1',
    tenants: [{ id: 't_1', name: '星河科技', role: 'owner', status: 'active', lastActiveAt: null }],
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/resources/r_1']}>
        <AntdApp>
          <Routes>
            <Route path="/app/resources/:id" element={<ResourceDetail />} />
          </Routes>
        </AntdApp>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ResourceDetail', () => {
  beforeEach(() => {
    vi.mocked(resourceApi.detail).mockReset();
  });

  it('渲染名称、分类、创建人与描述', async () => {
    vi.mocked(resourceApi.detail).mockResolvedValue(item);

    renderPage();

    expect(await screen.findByText('产品需求清单 v3')).toBeInTheDocument();
    expect(screen.getByText('文档')).toBeInTheDocument();
    expect(screen.getByText('李顺')).toBeInTheDocument();
    expect(screen.getByText('本季度需求汇总')).toBeInTheDocument();
    // admin / owner 可见编辑与删除入口
    expect(screen.getByText('编辑')).toBeInTheDocument();
    expect(screen.getByText('删除')).toBeInTheDocument();
  });

  it('404 时渲染「资源不存在或已被删除」空态而不是报错', async () => {
    vi.mocked(resourceApi.detail).mockRejectedValue({
      code: 'RESOURCE_NOT_FOUND',
      message: '资源不存在或已被删除',
      httpStatus: 404,
    });

    renderPage();

    expect(await screen.findByText('资源不存在或已被删除')).toBeInTheDocument();
    expect(screen.getByText('返回资源列表')).toBeInTheDocument();
  });
});
