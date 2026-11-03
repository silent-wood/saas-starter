/**
 * 登录页（规范 §7 路由 / §10 状态 / §18 错误态 / §24 文案）
 *
 * 校验：复用 `@saas/shared` 的 `loginSchema`，前后端同一份规则，不在 web 侧重复定义。
 * 提交：当前阶段**不发请求**——校验通过后仅写入模拟 token 并跳转（规范 §19 记录的
 * "演示期有意取舍"）。接真实后端时只需把 `onSubmit` 换成
 * `apiClient.post('/auth/login', values)`，表单层无需改动。
 */
import { Button, Card, Form, Input, Typography } from 'antd';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate } from 'react-router';
import { loginSchema, type LoginInput } from '@saas/shared';
import { TOKEN_KEY } from '@/app/guards/RequireAuth';
import { COPY } from '@/constants/copy';

const { Title, Text } = Typography;

/** 登录页：邮箱 + 密码，校验通过后写入模拟登录态并进入应用 */
export default function Login() {
  const navigate = useNavigate();
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
  if (localStorage.getItem(TOKEN_KEY)) {
    return <Navigate to="/app" replace />;
  }

  const onSubmit = () => {
    // 不发请求：仅本地模拟登录态
    localStorage.setItem(TOKEN_KEY, `mock-token-${Date.now()}`);
    navigate('/app', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-[400px]">
        <Title level={3} className="mb-6!">
          {COPY.auth.loginTitle}
        </Title>

        <Form layout="vertical" onFinish={() => void handleSubmit(onSubmit)()} requiredMark={false}>
          <Form.Item
            label={COPY.auth.email}
            validateStatus={errors.email ? 'error' : undefined}
            help={errors.email?.message}
          >
            <Controller
              name="email"
              control={control}
              render={({ field }) => (
                <Input {...field} placeholder="you@example.com" size="large" autoComplete="email" />
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
                  size="large"
                  autoComplete="current-password"
                />
              )}
            />
          </Form.Item>

          <Button type="primary" htmlType="submit" block size="large">
            {COPY.auth.loginAction}
          </Button>
        </Form>

        <div className="mt-4 text-center">
          <Text type="secondary" className="mr-1">
            {COPY.auth.noAccount}
          </Text>
          <Link to="/register">{COPY.auth.goRegister}</Link>
        </div>
      </Card>
    </div>
  );
}
