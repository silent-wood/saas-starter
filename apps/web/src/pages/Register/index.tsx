/**
 * 注册页 —— 与登录页共用设计稿 S1 的卡片外壳（Tab 切到「注册」）
 *
 * 校验：`registerFormSchema` = 共享 registerSchema + confirmPassword 一致性校验。
 * 提交：当前阶段**不发请求**——校验通过后仅提示成功并跳转登录页。
 * 接真实后端时把 `onSubmit` 换成 `apiClient.post('/auth/register', values)` 即可，
 * 注意提交前需剔除 `confirmPassword`（它不属于接口契约）。
 */
import { App, Button, Form, Input } from 'antd';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router';
import { AuthShell } from '@/components/auth/AuthShell';
import { COPY } from '@/constants/copy';
import { getToken } from '@/utils/token';
import { REGISTER_COPY } from './constants';
import { registerFormSchema, type RegisterFormValues } from './schema';

/** 注册页：公司 / 姓名 / 邮箱 / 密码 + 二次确认 */
export default function Register() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      tenantName: '',
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
    mode: 'onBlur',
  });

  // 已登录无需注册；所有 hook 必须在条件返回之前（rules-of-hooks）
  if (getToken()) {
    return <Navigate to="/app" replace />;
  }

  const onSubmit = () => {
    // 不发请求：仅前端提示成功并回到登录页
    void message.success(REGISTER_COPY.success);
    navigate('/login', { replace: true });
  };

  return (
    <AuthShell mode="register" privacy={COPY.auth.privacyRegister}>
      <Form
        className="auth-form"
        layout="vertical"
        onFinish={() => void handleSubmit(onSubmit)()}
        requiredMark={false}
      >
        <Form.Item
          label={COPY.auth.tenantName}
          validateStatus={errors.tenantName ? 'error' : undefined}
          help={errors.tenantName?.message}
        >
          <Controller
            name="tenantName"
            control={control}
            render={({ field }) => <Input {...field} placeholder="如：星河科技 / 我的团队" />}
          />
        </Form.Item>

        <Form.Item
          label={COPY.auth.name}
          validateStatus={errors.name ? 'error' : undefined}
          help={errors.name?.message}
        >
          <Controller
            name="name"
            control={control}
            render={({ field }) => <Input {...field} placeholder="请输入姓名" />}
          />
        </Form.Item>

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
          extra={errors.password ? undefined : REGISTER_COPY.passwordHint}
        >
          <Controller
            name="password"
            control={control}
            render={({ field }) => (
              <Input.Password
                {...field}
                placeholder="请输入密码"
                autoComplete="new-password"
                // 设计稿的密码框没有显隐切换图标，保持一致
                visibilityToggle={false}
              />
            )}
          />
        </Form.Item>

        <Form.Item
          label={COPY.auth.confirmPassword}
          validateStatus={errors.confirmPassword ? 'error' : undefined}
          help={errors.confirmPassword?.message}
        >
          <Controller
            name="confirmPassword"
            control={control}
            render={({ field }) => (
              <Input.Password
                {...field}
                placeholder="请再次输入密码"
                autoComplete="new-password"
                visibilityToggle={false}
              />
            )}
          />
        </Form.Item>

        <Button type="primary" htmlType="submit" block size="large" className="mt-6">
          {COPY.auth.registerAction}
        </Button>
      </Form>
    </AuthShell>
  );
}
