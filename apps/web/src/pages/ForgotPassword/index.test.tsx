import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App as AntdApp } from 'antd';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '@/shared/api/auth';
import { ForgotPassword } from './index';

vi.mock('@/shared/api/auth', () => ({
  authApi: { forgotPassword: vi.fn() },
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <AntdApp>
        <ForgotPassword />
      </AntdApp>
    </MemoryRouter>,
  );
}

describe('ForgotPassword', () => {
  beforeEach(() => {
    vi.mocked(authApi.forgotPassword).mockReset();
  });

  it('还原设计稿 R7：标题、说明、邮箱字段、链接有效期提示、主按钮、返回登录', () => {
    renderPage();

    expect(screen.getByText('找回密码')).toBeInTheDocument();
    expect(screen.getByText('输入注册邮箱，我们会发送重置链接')).toBeInTheDocument();

    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    // 防枚举口径的辅助说明：只承诺链接有效期，不承诺"邮箱已注册"
    expect(screen.getByText('链接 30 分钟内有效，且仅可使用一次')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /发送重置链接/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回登录' })).toHaveAttribute('href', '/login');
  });

  it('提交成功后进入 R8 已发送态：回显邮箱、重发按钮进 60s 冷却', async () => {
    vi.mocked(authApi.forgotPassword).mockResolvedValue({ ok: true });

    renderPage();
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'me@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /发送重置链接/ }));

    expect(await screen.findByText('邮件已发送')).toBeInTheDocument();
    expect(authApi.forgotPassword).toHaveBeenCalledWith({ email: 'me@example.com' });
    expect(screen.getByText('me@example.com')).toBeInTheDocument();
    // 冷却中的重发按钮必须是禁用态，否则会被连点刷邮件
    expect(screen.getByRole('button', { name: /重新发送（60s）/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: '返回登录' })).toBeEnabled();
  });
});
