/**
 * 登录页 —— 还原设计稿 S1「登录」画板
 *
 * 视觉：AuthShell 负责卡片（360 宽 / padding 32 / radius 8 / shadow）、品牌区与 Tab；
 * 本文件只负责表单区（邮箱 / 密码 / 记住我 + 忘记密码 / 主按钮）。
 *
 * 校验：复用 `@saas/shared` 的 `loginSchema`，前后端同一份规则，不在 web 侧重复定义。
 * 「记住我」是纯 UI 关注点（不进接口契约），所以用 useState 而非塞进 schema。
 *
 * 提交：当前阶段**不发请求**——校验通过后写入模拟 token 并跳转（规范 §19 记录的
 * "演示期有意取舍"）。接真实后端时把 `onSubmit` 换成
 * `apiClient.post('/auth/login', values)`，表单层无需改动。
 */
import { useState } from 'react';
import { App, Button, Checkbox, Form, Input } from 'antd';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router';
import { loginSchema, type LoginInput } from '@saas/shared';
import { AuthShell } from '@/components/auth/AuthShell';
import { COPY } from '@/constants/copy';
import { getToken, setToken } from '@/utils/token';

/** 登录页：邮箱 + 密码，校验通过后写入登录态并进入应用 */
export default function Login() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  // 「记住我」只影响 token 的持久化位置（localStorage / sessionStorage），不属于表单校验
  const [remember, setRemember] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onBlur',
  });

  // 已登录直接进首页；注意所有 hook 必须写在条件返回之前（rules-of-hooks）
  if (getToken()) {
    return <Navigate to="/app" replace />;
  }

  const onSubmit = () => {
    // 不发请求：仅本地模拟登录态
    setToken(`mock-token-${Date.now()}`, remember);
    navigate('/app', { replace: true });
  };

  return (
    <AuthShell mode="login" privacy={COPY.auth.privacyLogin}>
      <Form
        className="auth-form"
        layout="vertical"
        onFinish={() => void handleSubmit(onSubmit)()}
        requiredMark={false}
      >
        <Form.Item
          label={COPY.auth.email}
          validateStatus={errors.email ? 'error' : undefined}
          help={errors.email?.message}
        >
          <Controller
            name="email"
            control={control}
            render={({ field }) => (
              <Input {...field} placeholder="you@example.com" autoComplete="email" />
            )}
          />
        </Form.Item>

        <Form.Item
          label={COPY.auth.password}
          validateStatus={errors.password ? 'error' : undefined}
          help={errors.password?.message}
        >
          <Controller
            name="password"
            control={control}
            render={({ field }) => (
              <Input.Password
                {...field}
                placeholder="请输入密码"
                autoComplete="current-password"
                // 设计稿的密码框没有显隐切换图标，保持一致
                visibilityToggle={false}
              />
            )}
          />
        </Form.Item>

        {/* 辅助行：左「记住我」，右「忘记密码?」 */}
        <div className="flex items-center justify-between">
          <Checkbox
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            className="text-sm! leading-[22px]! text-ink-2!"
          >
            {COPY.auth.rememberMe}
          </Checkbox>
          <button
            type="button"
            onClick={() => void message.info(COPY.auth.forgotPasswordTodo)}
            className="cursor-pointer border-0 bg-transparent p-0 text-sm leading-[22px] text-primary"
          >
            {COPY.auth.forgotPassword}
          </button>
        </div>

        <Button type="primary" htmlType="submit" block size="large" className="mt-6">
          {COPY.auth.loginAction}
        </Button>
      </Form>
    </AuthShell>
  );
}
