/**
 * 接受邀请页测试（05 方案 §3.2 / v1.4 的「已接受自动放行」）
 *
 * 覆盖四件事：
 *  1. 正常邀请：展示团队与邀请人，点「加入团队」后切租户进 `/app`
 *  2. `accepted` 且用户仍是成员：**自动**调用 accept 并直接进工作台，不显示「已被使用」
 *  3. `accepted` 但成员关系已不在（410）：才提示「这条邀请已被使用」
 *  4. `accepted` 且邮箱不匹配（409）：显示后端给的原因，不假装成功
 *
 * 第 2 条是本节的重点：`remove()` 只改 membership、不动 invite，被移出的人点旧链接时
 * `accepted` 仍是 true —— 但正常重复点链接的人也走同一个分支。只靠 `accepted` 一个布尔
 * 分不出这两种人，所以放行与否必须交给 `acceptInvite` 的幂等分支去判。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { App as AntdApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvitePreview } from '@saas/shared';
import { memberApi } from '@/shared/api/member';
import { useTenantStore } from '@/stores/tenant';
import { JoinPage } from './page';

vi.mock('@/shared/api/member', () => ({
  memberApi: { previewInvite: vi.fn(), acceptInvite: vi.fn() },
}));

const switchTenant = vi.fn(async () => {});
vi.mock('@/hooks/useSwitchTenant', () => ({
  useSwitchTenant: () => switchTenant,
}));

const preview = (patch: Partial<InvitePreview> = {}): InvitePreview => ({
  tenantName: '星河科技',
  role: 'member',
  inviterName: '李顺',
  email: 'invitee@test.com',
  expired: false,
  accepted: false,
  ...patch,
});

const acceptedTenant = {
  id: 't_1',
  name: '星河科技',
  role: 'member' as const,
  status: 'active' as const,
  lastActiveAt: null,
};

function renderJoin(token = 'tok-1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/join?token=${token}`]}>
        <AntdApp>
          <Routes>
            <Route path="/join" element={<JoinPage />} />
            <Route path="/app" element={<div>工作台占位</div>} />
          </Routes>
        </AntdApp>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('JoinPage', () => {
  beforeEach(() => {
    vi.mocked(memberApi.previewInvite).mockReset();
    vi.mocked(memberApi.acceptInvite).mockReset();
    switchTenant.mockClear();
    useTenantStore.setState({ tenants: [], currentTenantId: null });
  });

  it('正常邀请：点「加入团队」后切租户并进工作台', async () => {
    vi.mocked(memberApi.previewInvite).mockResolvedValue(preview());
    vi.mocked(memberApi.acceptInvite).mockResolvedValue(acceptedTenant);

    renderJoin();

    expect(await screen.findByText('李顺 邀请你以「成员」身份加入')).toBeInTheDocument();
    // 未接受的邀请不该自动发 accept
    expect(memberApi.acceptInvite).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /加入团队/ }));

    expect(await screen.findByText('工作台占位')).toBeInTheDocument();
    expect(switchTenant).toHaveBeenCalledWith('t_1');
    // 新团队要补进列表，否则头像下拉渲染成空
    expect(useTenantStore.getState().tenants.map((t) => t.id)).toContain('t_1');
  });

  it('已接受且仍是成员：自动放行，直接进工作台', async () => {
    vi.mocked(memberApi.previewInvite).mockResolvedValue(preview({ accepted: true }));
    vi.mocked(memberApi.acceptInvite).mockResolvedValue(acceptedTenant);

    renderJoin();

    // 不需要用户做任何操作：自动调 accept（幂等）→ switchTenant → /app
    expect(await screen.findByText('工作台占位')).toBeInTheDocument();
    expect(memberApi.acceptInvite).toHaveBeenCalledWith({ token: 'tok-1' });
    expect(memberApi.acceptInvite).toHaveBeenCalledTimes(1);
    expect(switchTenant).toHaveBeenCalledWith('t_1');
    // 关键：不能先甩一句「这条邀请已被使用」给他
    expect(screen.queryByText('这条邀请已被使用')).not.toBeInTheDocument();
  });

  it('已接受但已不在团队（410）：提示邀请已被使用，不跳转', async () => {
    vi.mocked(memberApi.previewInvite).mockResolvedValue(preview({ accepted: true }));
    vi.mocked(memberApi.acceptInvite).mockRejectedValue({
      code: 'TOKEN_INVALID',
      message: '邀请链接无效或已被使用',
      httpStatus: 410,
    });

    renderJoin();

    expect(await screen.findByText('这条邀请已被使用')).toBeInTheDocument();
    expect(screen.queryByText('工作台占位')).not.toBeInTheDocument();
    expect(switchTenant).not.toHaveBeenCalled();
  });

  it('已接受但邮箱不匹配（409）：显示后端原因，不假装加入成功', async () => {
    vi.mocked(memberApi.previewInvite).mockResolvedValue(preview({ accepted: true }));
    vi.mocked(memberApi.acceptInvite).mockRejectedValue({
      code: 'MEMBER_STATE_INVALID',
      message: '该邀请是发给 invitee@test.com 的，请用该邮箱登录后再接受',
      httpStatus: 409,
    });

    renderJoin();

    expect(await screen.findByText('无法进入团队')).toBeInTheDocument();
    // errorText 会把 message 摊到文案里
    await waitFor(() =>
      expect(screen.getByText(/该邀请是发给 invitee@test\.com 的/)).toBeInTheDocument(),
    );
    expect(screen.queryByText('工作台占位')).not.toBeInTheDocument();
  });

  it('邀请已失效（410 预览失败）：显示失效提示，不发 accept', async () => {
    vi.mocked(memberApi.previewInvite).mockRejectedValue({
      code: 'TOKEN_INVALID',
      message: '邀请链接无效或已被使用',
      httpStatus: 410,
    });

    renderJoin();

    expect(await screen.findByText('邀请已失效')).toBeInTheDocument();
    expect(memberApi.acceptInvite).not.toHaveBeenCalled();
  });
});
