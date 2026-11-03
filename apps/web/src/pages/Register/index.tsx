/**
 * 注册页（规范 §5 校验 / §7 路由 / §18 错误态 / §24 文案）
 *
 * 校验：`registerFormSchema` = 共享 registerSchema + confirmPassword 一致性校验。
 * 提交：当前阶段**不发请求**——校验通过后仅提示成功并跳转登录页。
 * 接真实后端时把 `onSubmit` 换成 `apiClient.post('/auth/register', values)` 即可，
 * 注意提交前需剔除 `confirmPassword`（它不属于接口契约）。
 */
import { App, Button, Card, Form, Input, Typography } from 'antd';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate } from 'react-router';
import { TOKEN_KEY } from '@/app/guards/RequireAuth';
import { COPY } from '@/constants/copy';
import { REGISTER_COPY } from './constants';
import { registerFormSchema, type RegisterFormValues } from './schema';

const { Title, Text } = Typography;

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
      companyName: '',
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
    mode: 'onBlur',
  });

  // 已登录无需注册；所有 hook 必须在条件返回之前（rules-of-hooks）
  if (localStorage.getItem(TOKEN_KEY)) {
    return <Navigate to="/app" replace />;
  }

  const onSubmit = () => {
    // 不发请求：仅前端提示成功并回到登录页
    message.success(REGISTER_COPY.success);
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-[400px]">
        <Title level={3} className="mb-1!">
          {COPY.auth.registerTitle}
        </Title>
        <Text type="secondary">{REGISTER_COPY.subtitle}</Text>

        <Form
          layout="vertical"
          onFinish={() => void handleSubmit(onSubmit)()}
          requiredMark={false}
          className="mt-6"
        >
          <Form.Item
            label={COPY.auth.companyName}
            validateStatus={errors.companyName ? 'error' : undefined}
            help={errors.companyName?.message}
          >
            <Controller
              name="companyName"
              control={control}
              render={({ field }) => (
                <Input {...field} placeholder="请输入公司或团队名称" size="large" />
              )}
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
              render={({ field }) => <Input {...field} placeholder="请输入姓名" size="large" />}
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
                <Input {...field} placeholder="you@example.com" size="large" autoComplete="email" />
              )}
            />
          </Form.Item>

          <Form.Item
            label={COPY.auth.password}
            validateStatus={errors.password ? 'error' : undefined}
            help={errors.password?.message ?? REGISTER_COPY.passwordHint}
          >
            <Controller
              name="password"
              control={control}
              render={({ field }) => (
                <Input.Password
                  {...field}
                  placeholder="请输入密码"
                  size="large"
                  autoComplete="new-password"
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
                  size="large"
                  autoComplete="new-password"
                />
              )}
            />
          </Form.Item>

          <Button type="primary" htmlType="submit" block size="large" className="mt-2">
            {COPY.auth.registerAction}
          </Button>
        </Form>

        <div className="mt-4 text-center">
          <Text type="secondary" className="mr-1">
            {COPY.auth.hasAccount}
          </Text>
          <Link to="/login">{COPY.auth.goLogin}</Link>
        </div>
      </Card>
    </div>
  );
}
