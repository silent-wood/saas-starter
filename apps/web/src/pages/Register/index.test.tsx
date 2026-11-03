import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App as AntdApp } from 'antd';
import { describe, expect, it } from 'vitest';
import Register from './index';

function renderRegister() {
  return render(
    <MemoryRouter>
      <AntdApp>
        <Register />
      </AntdApp>
    </MemoryRouter>,
  );
}

describe('Register', () => {
  it('渲染全部注册字段与提交按钮', () => {
    renderRegister();

    expect(screen.getByText('团队名称')).toBeInTheDocument();
    expect(screen.getByText('姓名')).toBeInTheDocument();
    expect(screen.getByText('邮箱')).toBeInTheDocument();
    expect(screen.getByText('确认密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /注\s*册/ })).toBeInTheDocument();
  });

  it('Tab 处于注册选中态，隐私声明为注册文案', () => {
    renderRegister();

    expect(screen.getByRole('tab', { name: '注册' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '登录' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('注册即代表同意《服务条款》与《隐私政策》')).toBeInTheDocument();
  });

  it('空表单提交时展示 zod 校验错误', async () => {
    renderRegister();

    // antd 会在两个中文字符间自动插入空格（autoInsertSpace），故用正则匹配
    fireEvent.click(screen.getByRole('button', { name: /注\s*册/ }));

    // zodResolver 为异步校验，需 findBy 等待错误渲染
    expect(await screen.findByText('团队名称至少 2 个字符')).toBeInTheDocument();
  });
});
