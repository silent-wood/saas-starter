import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App as AntdApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const { resetPassword } = vi.hoisted(() => ({ resetPassword: vi.fn() }));

vi.mock('@/shared/api/auth', () => ({
  authApi: { resetPassword: (body: unknown) => resetPassword(body) },
}));

import { ResetPassword } from './index';

function renderPage(entry: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <AntdApp>
          <ResetPassword />
        </AntdApp>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ResetPassword', () => {
  it('没有 token 时直接进 R10 失效态，不打空请求', () => {
    renderPage('/reset-password');

    expect(screen.getByText('链接已失效')).toBeInTheDocument();
    expect(
      screen.getByText('重置链接只能使用一次，且 30 分钟内有效。请重新申请一条新的链接。'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重新获取链接/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /返回登录/ })).toBeInTheDocument();
  });

  it('带 token 时渲染 R9 表单：两条强度提示与他端下线提醒都在', () => {
    renderPage('/reset-password?token=abc123');

    expect(screen.getByText('设置新密码')).toBeInTheDocument();
    expect(screen.getByText('请为你的账号设置新密码')).toBeInTheDocument();

    expect(screen.getByText('新密码')).toBeInTheDocument();
    expect(screen.getByText('确认新密码')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('再次输入新密码')).toBeInTheDocument();

    // 强度提示必须与 resetPasswordSchema 的规则逐条对应
    expect(screen.getByText('8–64 个字符')).toBeInTheDocument();
    expect(screen.getByText('同时包含字母与数字')).toBeInTheDocument();

    // 提交前的副作用告知，不能只在成功后才说
    expect(screen.getByText('重置后，其它设备上的登录状态将全部失效')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重置密码/ })).toBeInTheDocument();
  });

  /**
   * 回归用例：表单 schema 曾直接继承 `resetPasswordSchema`，把 `token` 也带进了校验，
   * 而页面上没有 token 输入框 → 校验永远失败 → 点提交既不发请求也无任何提示。
   * 只测渲染发现不了，必须测到「提交后到底发了什么」。
   */
  it('提交时把 URL 里的 token 一起发给后端', async () => {
    resetPassword.mockResolvedValue({ ok: true });
    renderPage('/reset-password?token=tok123');

    fireEvent.change(screen.getByPlaceholderText('请输入新密码'), {
      target: { value: 'Test1234ab' },
    });
    fireEvent.change(screen.getByPlaceholderText('再次输入新密码'), {
      target: { value: 'Test1234ab' },
    });
    fireEvent.click(screen.getByRole('button', { name: /重置密码/ }));

    await waitFor(
      () => expect(resetPassword).toHaveBeenCalledWith({ token: 'tok123', password: 'Test1234ab' }),
      { timeout: 4000 },
    );
  });
});
