import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App as AntdApp } from 'antd';
import { describe, expect, it } from 'vitest';
import Login from './index';

function renderLogin() {
  return render(
    <MemoryRouter>
      <AntdApp>
        <Login />
      </AntdApp>
    </MemoryRouter>,
  );
}

describe('Login', () => {
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
    expect(screen.getByText('记住我')).toBeInTheDocument();
    expect(screen.getByText('忘记密码?')).toBeInTheDocument();

    // 主按钮与隐私声明
    expect(screen.getByRole('button', { name: /登\s*录/ })).toBeInTheDocument();
    expect(screen.getByText('登录即代表同意《服务条款》与《隐私政策》')).toBeInTheDocument();
  });
});
