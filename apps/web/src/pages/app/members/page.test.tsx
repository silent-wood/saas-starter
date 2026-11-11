/**
 * 成员页测试（05 方案 §5.1）
 *
 * 覆盖三件事：
 *  1. member 角色是只读通讯录：没有「邀请成员」按钮，也没有转让入口
 *  2. owner 能邀请，且行内出现「禁用 / 移除 / 转让」
 *  3. 没有待接受邀请时，整块「待接受的邀请」不渲染（空表头会让人以为出错了）
 *
 * 数据取自 mock 的 `memberApi.list`，不连后端；权限来自 `useTenantStore`
 * 里的租户列表项（角色挂在列表上，见 `usePermission` 的注释）。
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App as AntdApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemberItem } from '@saas/shared';
import { memberApi } from '@/shared/api/member';
import { useTenantStore } from '@/stores/tenant';
import { MembersPage } from './page';

vi.mock('@/shared/api/member', () => ({
  memberApi: {
    list: vi.fn(),
    invite: vi.fn(),
    resendInvite: vi.fn(),
    revokeInvite: vi.fn(),
    updateRole: vi.fn(),
    disable: vi.fn(),
    enable: vi.fn(),
    remove: vi.fn(),
    transferOwner: vi.fn(),
    previewInvite: vi.fn(),
    acceptInvite: vi.fn(),
  },
}));

const owner: MemberItem = {
  id: 'm_owner',
  userId: 'u_owner',
  nickname: '李顺',
  email: 'owner@test.com',
  avatarUrl: null,
  role: 'owner',
  status: 'active',
  joinedAt: '2026-11-01T00:00:00.000Z',
  isSelf: true,
};

const member: MemberItem = {
  id: 'm_member',
  userId: 'u_member',
  nickname: '王五',
  email: 'member@test.com',
  avatarUrl: null,
  role: 'member',
  status: 'active',
  joinedAt: '2026-11-02T00:00:00.000Z',
  isSelf: false,
};

const invite = {
  id: 'i1',
  email: 'new@test.com',
  role: 'member' as const,
  expired: false,
  expiresAt: '2026-11-18T00:00:00.000Z',
  invitedByName: '李顺',
  createdAt: '2026-11-11T00:00:00.000Z',
};

function setRole(role: 'owner' | 'member') {
  useTenantStore.setState({
    currentTenantId: 't1',
    tenants: [{ id: 't1', name: '星河科技', role, status: 'active', lastActiveAt: null }],
    tenantsLoaded: true,
  });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/members']}>
        <AntdApp>
          <MembersPage />
        </AntdApp>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('MembersPage', () => {
  beforeEach(() => {
    vi.mocked(memberApi.list).mockReset();
  });

  it('member 角色只能看：没有邀请按钮，也没有转让入口', async () => {
    setRole('member');
    vi.mocked(memberApi.list).mockResolvedValue({
      members: [owner, { ...member, isSelf: true }],
      invites: [],
    });

    renderPage();

    expect(await screen.findByText('王五')).toBeInTheDocument();
    expect(screen.queryByText('邀请成员')).not.toBeInTheDocument();
    expect(screen.queryByText('转让')).not.toBeInTheDocument();
    // 待接受区没有数据整块不渲染
    expect(screen.queryByText('待接受的邀请')).not.toBeInTheDocument();
  });

  it('owner 能看到邀请按钮与成员行操作', async () => {
    setRole('owner');
    vi.mocked(memberApi.list).mockResolvedValue({ members: [owner, member], invites: [] });

    renderPage();

    expect(await screen.findByText('王五')).toBeInTheDocument();
    expect(screen.getByText('邀请成员')).toBeInTheDocument();
    // 自己那一行（owner）不出现转让；普通成员行有
    expect(screen.getByText('转让')).toBeInTheDocument();
    expect(screen.getAllByText('移除')).toHaveLength(2);
  });

  it('有待接受邀请时渲染第二张表，并给出重发 / 撤销', async () => {
    setRole('owner');
    vi.mocked(memberApi.list).mockResolvedValue({ members: [owner], invites: [invite] });

    renderPage();

    expect(await screen.findByText('待接受的邀请')).toBeInTheDocument();
    expect(screen.getByText('new@test.com')).toBeInTheDocument();
    expect(screen.getByText('重发')).toBeInTheDocument();
    expect(screen.getByText('撤销')).toBeInTheDocument();
  });
});
