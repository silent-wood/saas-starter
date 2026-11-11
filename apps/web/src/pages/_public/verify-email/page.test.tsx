import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App as AntdApp } from 'antd';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '@/shared/api/auth';
import VerifyEmail from './page';

vi.mock('@/shared/api/auth', () => ({
  authApi: { verifyEmail: vi.fn() },
}));

function renderPage(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AntdApp>
        <VerifyEmail />
      </AntdApp>
    </MemoryRouter>,
  );
}

describe('VerifyEmail', () => {
  beforeEach(() => {
    vi.mocked(authApi.verifyEmail).mockReset();
  });

  it('没有 token 时直接是 R12 失效态，且不发起请求', () => {
    renderPage('/verify-email');

    expect(screen.getByText('链接无效或已过期')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /返回注册/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /返回登录/ })).toBeInTheDocument();
    expect(authApi.verifyEmail).not.toHaveBeenCalled();
  });

  it('验证通过时展示 R11 成功态：不再承诺「团队已创建」', async () => {
    vi.mocked(authApi.verifyEmail).mockResolvedValue({ verified: true, tenantId: 't_1' });

    renderPage('/verify-email?token=ok');

    expect(await screen.findByText('邮箱已验证')).toBeInTheDocument();
    expect(screen.getByText('账号已激活，从现在起可以登录。')).toBeInTheDocument();
    // v1.3：受邀注册验证后是加入别人的团队，压根没有新建租户，
    // 而接口只返回 tenantId、分不出是哪种，所以这句不能出现
    expect(screen.queryByText('团队空间已创建')).not.toBeInTheDocument();
    expect(screen.queryByText('你是该团队 Owner')).not.toBeInTheDocument();
    // 成功不等于已登录：主按钮去登录页，不直接进工作台
    expect(screen.getByRole('button', { name: /去登录/ })).toBeInTheDocument();
    expect(authApi.verifyEmail).toHaveBeenCalledWith({ token: 'ok' });
    expect(authApi.verifyEmail).toHaveBeenCalledTimes(1);
  });

  it('令牌失效时落到 R12 失效态', async () => {
    vi.mocked(authApi.verifyEmail).mockRejectedValue({ code: 'TOKEN_INVALID' });

    renderPage('/verify-email?token=used');

    expect(await screen.findByText('链接无效或已过期')).toBeInTheDocument();
    expect(screen.getByText('重新提交注册可再收一封验证邮件')).toBeInTheDocument();
  });
});
