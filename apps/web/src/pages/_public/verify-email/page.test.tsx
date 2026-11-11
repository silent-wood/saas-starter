import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { App as AntdApp } from 'antd';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '@/shared/api/auth';
import { useAuthStore } from '@/stores/auth';
import VerifyEmail from './page';

vi.mock('@/shared/api/auth', () => ({
  authApi: { verifyEmail: vi.fn() },
}));

function renderPage(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AntdApp>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmail />} />
          {/* 验证通过后应直接进工作台（不是回登录页），用占位页接住跳转 */}
          <Route path="/app" element={<div>工作台占位</div>} />
          <Route path="/login" element={<div>登录页占位</div>} />
        </Routes>
      </AntdApp>
    </MemoryRouter>,
  );
}

describe('VerifyEmail', () => {
  beforeEach(() => {
    vi.mocked(authApi.verifyEmail).mockReset();
    useAuthStore.setState({ accessToken: null, user: null, status: 'booting' });
  });

  it('没有 token 时直接是 R12 失效态，且不发起请求', () => {
    renderPage('/verify-email');

    expect(screen.getByText('链接无效或已过期')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /返回注册/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /返回登录/ })).toBeInTheDocument();
    expect(authApi.verifyEmail).not.toHaveBeenCalled();
  });

  it('验证通过即登录：写入会话并直接进工作台，不经过登录页', async () => {
    vi.mocked(authApi.verifyEmail).mockResolvedValue({
      verified: true,
      tenantId: 't_1',
      accessToken: 'at_1',
      user: {
        id: 'u1',
        email: 'invitee@example.com',
        name: '张三',
        emailVerified: true,
        avatarUrl: null,
      },
    });

    renderPage('/verify-email?token=ok');

    expect(await screen.findByText('工作台占位')).toBeInTheDocument();
    // v1.4：验证即登录，store 里必须直接有会话
    expect(useAuthStore.getState().accessToken).toBe('at_1');
    expect(useAuthStore.getState().user?.email).toBe('invitee@example.com');
    expect(useAuthStore.getState().status).toBe('authenticated');
    // 不再有「去登录」这一步，也不该被送回登录页
    expect(screen.queryByText('登录页占位')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /去登录/ })).not.toBeInTheDocument();
    expect(authApi.verifyEmail).toHaveBeenCalledWith({ token: 'ok' });
    // StrictMode 外的门闩也要保证只提交一次：令牌一次性，第二次必然 TOKEN_INVALID
    expect(authApi.verifyEmail).toHaveBeenCalledTimes(1);
  });

  it('令牌失效时落到 R12 失效态', async () => {
    vi.mocked(authApi.verifyEmail).mockRejectedValue({ code: 'TOKEN_INVALID' });

    renderPage('/verify-email?token=used');

    expect(await screen.findByText('链接无效或已过期')).toBeInTheDocument();
    expect(screen.getByText('重新提交注册可再收一封验证邮件')).toBeInTheDocument();
    // 失败不能把用户带进工作台
    expect(screen.queryByText('工作台占位')).not.toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
