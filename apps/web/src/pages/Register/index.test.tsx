import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import Register from './index';

function renderRegister() {
  return render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>,
  );
}

describe('Register', () => {
  it('渲染全部注册字段与提交按钮', () => {
    renderRegister();

    expect(screen.getByText('公司名称')).toBeInTheDocument();
    expect(screen.getByText('姓名')).toBeInTheDocument();
    expect(screen.getByText('邮箱')).toBeInTheDocument();
    expect(screen.getByText('确认密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /注\s*册/ })).toBeInTheDocument();
  });

  it('空表单提交时展示 zod 校验错误', async () => {
    renderRegister();

    // antd 会在两个中文字符间自动插入空格（autoInsertSpace），故用正则匹配
    fireEvent.click(screen.getByRole('button', { name: /注\s*册/ }));

    // zodResolver 为异步校验，需 findBy 等待错误渲染
    expect(await screen.findByText('公司名称至少 2 个字符')).toBeInTheDocument();
  });
});
