import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { App as AntdApp } from 'antd';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '@/shared/api/auth';
import Register from './page';

vi.mock('@/shared/api/auth', () => ({
  authApi: { register: vi.fn() },
}));

function renderRegister(entry = '/register') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AntdApp>
        <Routes>
          <Route path="/register" element={<Register />} />
          {/* 跳转占位：「已发送」态里的「去登录」走这条路；也用于断言失败时不离开本页 */}
          <Route path="/login" element={<div>登录页占位</div>} />
        </Routes>
      </AntdApp>
    </MemoryRouter>,
  );
}

/** 填满一张合法表单：各字段规则与 registerSchema 对齐 */
function fillValidForm() {
  fireEvent.change(screen.getByPlaceholderText('如：星河科技 / 我的团队'), {
    target: { value: '星河科技' },
  });
  fireEvent.change(screen.getByPlaceholderText('请输入姓名'), {
    target: { value: '李顺' },
  });
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
    target: { value: 'me@example.com' },
  });
  fireEvent.change(screen.getByPlaceholderText('请输入密码'), {
    target: { value: 'Passw0rd' },
  });
  fireEvent.change(screen.getByPlaceholderText('请再次输入密码'), {
    target: { value: 'Passw0rd' },
  });
}

describe('Register', () => {
  beforeEach(() => {
    vi.mocked(authApi.register).mockReset();
  });

  it('还原设计稿 R1：字段、必填星号、字段说明、提交按钮齐备', () => {
    renderRegister();

    // 标签带必填星号（设计稿的星号在文字之后）
    expect(screen.getByText(/团队名称/)).toBeInTheDocument();
    expect(screen.getByText(/姓名/)).toBeInTheDocument();
    expect(screen.getByText(/确认密码/)).toBeInTheDocument();

    // 三条字段说明：解释字段用途，不是重复标签
    expect(screen.getByText('验证通过后作为租户名，可在设置中修改')).toBeInTheDocument();
    expect(screen.getByText('将收到验证邮件，验证后账号生效')).toBeInTheDocument();
    expect(screen.getByText('至少 8 位，需同时包含字母和数字')).toBeInTheDocument();

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

    // zodResolver 为异步校验，需 findBy 等待错误渲染。
    // 完全没填的文案是「请输入团队名称」，填了但不足 2 字才是「至少 2 个字符」
    expect(await screen.findByText('请输入团队名称')).toBeInTheDocument();
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('提交真实接口：剔除 confirmPassword，成功后留在本页展示「验证邮件已发送」', async () => {
    vi.mocked(authApi.register).mockResolvedValue({
      userId: 'usr_1',
      email: 'me@example.com',
    });

    renderRegister();
    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: /注\s*册/ }));

    // v1.4：注册成功不再跳登录页（那一步最容易被理解成「注册失败」）
    expect(await screen.findByText('验证邮件已发送')).toBeInTheDocument();
    expect(screen.getByText(/me@example\.com/)).toBeInTheDocument();
    expect(screen.queryByText('登录页占位')).not.toBeInTheDocument();
    // 关键：confirmPassword 是纯前端字段，多传一个后端会 422
    expect(authApi.register).toHaveBeenCalledWith({
      tenantName: '星河科技',
      name: '李顺',
      email: 'me@example.com',
      password: 'Passw0rd',
    });
  });

  it('「没收到」回到表单、邮箱保留，便于重发验证信', async () => {
    vi.mocked(authApi.register).mockResolvedValue({
      userId: 'usr_1',
      email: 'me@example.com',
    });

    renderRegister();
    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: /注\s*册/ }));
    await screen.findByText('验证邮件已发送');

    fireEvent.click(screen.getByRole('button', { name: /返回修改并重发/ }));

    // 回到表单且表单内容还在（react-hook-form 的 store 未销毁）
    expect(screen.getByPlaceholderText('you@example.com')).toHaveValue('me@example.com');
    expect(screen.queryByText('验证邮件已发送')).not.toBeInTheDocument();
  });

  it('EMAIL_TAKEN 落到邮箱字段下方，而不是弹一层就消失的 toast', async () => {
    vi.mocked(authApi.register).mockRejectedValue({
      code: 'EMAIL_TAKEN',
      message: '该邮箱已注册，请直接登录',
      httpStatus: 409,
    });

    renderRegister();
    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: /注\s*册/ }));

    expect(await screen.findByText('该邮箱已注册，请直接登录')).toBeInTheDocument();
    // 失败不能把用户带走
    expect(screen.queryByText('登录页占位')).not.toBeInTheDocument();
  });

  // ── v1.3 受邀注册 ─────────────────────────────────────────
  it('受邀注册：隐藏团队名称、显示说明条、提交带 inviteToken', async () => {
    vi.mocked(authApi.register).mockResolvedValue({
      userId: 'usr_2',
      email: 'invitee@example.com',
    });

    const returnTo = '/join?token=invite-abc';
    renderRegister(`/register?returnTo=${encodeURIComponent(returnTo)}`);

    // 这一格整块不渲染：受邀注册不建默认团队，填了也只是噪音
    expect(screen.queryByText(/团队名称/)).not.toBeInTheDocument();
    expect(screen.getByText(/你正在通过邀请加入团队/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('请输入姓名'), { target: { value: '张三' } });
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'invitee@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('请输入密码'), { target: { value: 'Passw0rd' } });
    fireEvent.change(screen.getByPlaceholderText('请再次输入密码'), {
      target: { value: 'Passw0rd' },
    });

    fireEvent.click(screen.getByRole('button', { name: /注\s*册/ }));

    expect(await screen.findByText('验证邮件已发送')).toBeInTheDocument();
    // 没有 tenantName，多了 inviteToken —— 后端据此跳过建团队
    expect(authApi.register).toHaveBeenCalledWith({
      name: '张三',
      email: 'invitee@example.com',
      password: 'Passw0rd',
      inviteToken: 'invite-abc',
    });
  });

  it('returnTo 指向站外时按普通注册处理（防开放重定向）', () => {
    // `//evil.com/join?token=x` 会被浏览器当成协议相对 URL
    renderRegister('/register?returnTo=%2F%2Fevil.com%2Fjoin%3Ftoken%3Dx');

    expect(screen.getByText(/团队名称/)).toBeInTheDocument();
    expect(screen.queryByText(/你正在通过邀请加入团队/)).not.toBeInTheDocument();
  });
});
