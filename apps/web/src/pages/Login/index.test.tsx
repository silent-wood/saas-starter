import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { App as AntdApp } from 'antd';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '@/shared/api/auth';
import Login from './index';

vi.mock('@/shared/api/auth', () => ({
  authApi: { login: vi.fn() },
}));

function renderLogin(state?: { registeredEmail: string }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state }]}>
      <AntdApp>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/app" element={<div>工作台占位</div>} />
        </Routes>
      </AntdApp>
    </MemoryRouter>,
  );
}

describe('Login', () => {
  beforeEach(() => {
    vi.mocked(authApi.login).mockReset();
    localStorage.clear();
  });

  it('还原设计稿 S1：品牌区、Tab、字段、辅助行、隐私声明齐备', () => {
    renderLogin();

    // 品牌区
    expect(screen.getByText('SaaS Starter')).toBeInTheDocument();
    expect(screen.getByText('团队协作 · 知识库 · AI 助手')).toBeInTheDocument();

    // Tab：登录选中、注册未选中
    expect(screen.getByRole('tab', { name: '登录' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '注册' })).toHaveAttribute('aria-selected', 'false');

    // 表单区
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    // 「忘记密码」不再是占位提示，而是真实跳转（方案 02 F-04）
    expect(screen.getByRole('link', { name: '忘记密码?' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );

    // 主按钮与隐私声明
    expect(screen.getByRole('button', { name: /登\s*录/ })).toBeInTheDocument();
    expect(screen.getByText('登录即代表同意《服务条款》与《隐私政策》')).toBeInTheDocument();
  });

  it('从注册页跳来时提示验证邮件已发送，并预填邮箱', () => {
    renderLogin({ registeredEmail: 'me@example.com' });

    expect(screen.getByText('验证邮件已发送')).toBeInTheDocument();
    expect(screen.getByText(/请到 me@example\.com 查收验证邮件/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@example.com')).toHaveValue('me@example.com');
  });
});
