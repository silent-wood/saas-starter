/**
 * 登录页 —— 还原设计稿 S1「登录」画板
 *
 * 视觉：AuthShell 负责卡片（360 宽 / padding 32 / radius 8 / shadow）、品牌区与 Tab；
 * 本文件只负责表单区（邮箱 / 密码 / 记住我 + 忘记密码 / 主按钮）。
 *
 * 校验：复用 `@saas/shared` 的 `loginSchema`，前后端同一份规则，不在 web 侧重复定义。
 * 「记住我」进接口契约（`rememberMe`），决定 refresh cookie 是持久还是会话级；
 * 本地只额外记住邮箱，不落任何令牌。
 *
 * 提交：走真实接口 `POST /auth/login`（方案 01），成功后写 store 并跳转 /app。
 * 「忘记密码」跳 `/forgot-password`（方案 02 F-04），不再给「开发中」的占位提示。
 */
import { useState } from 'react';
import { Alert, App, Button, Form, Input } from 'antd';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';
import { loginSchema, type LoginInput } from '@saas/shared';
import { AuthShell } from '@/components/auth/AuthShell';
import { COPY } from '@/constants/copy';
import { authApi } from '@/shared/api/auth';
import { useAuthStore } from '@/stores/auth';
import type { ApiError } from '@/shared/api/client';
import { safeReturnTo } from '@/utils/returnTo';
import { LOGIN_COPY, REMEMBERED_EMAIL_KEY } from './constants';

/** 注册页跳过来时带的 state（只读，不参与接口契约） */
interface LoginLocationState {
  registeredEmail?: string;
}

/** 登录页：邮箱 + 密码，校验通过后写入登录态并进入应用 */
export default function Login() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const location = useLocation();

  const registeredEmail = (location.state as LoginLocationState | null)?.registeredEmail;
  /** 上次记住的邮箱：注册跳转的优先级更高，它一定是最新提交的那个 */
  const rememberedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? '';

  /** 提示条可关闭：用户已经知道要收信了，不该每次刷新都占着卡片顶部 */
  const [showRegistered, setShowRegistered] = useState(Boolean(registeredEmail));

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: registeredEmail ?? rememberedEmail, password: '' },
    mode: 'onBlur',
  });

  const onSubmit = async (values: LoginInput) => {
    try {
      // 显式传 true，把「默认持久登录」写进调用方而不是靠后端默认值：
      // 将来要做「不记住」时，这里改成受控值即可，服务端不用再改一次契约
      const { accessToken, user } = await authApi.login({ ...values, rememberMe: true });
      // 只记邮箱用于下次预填。登录态本身由 refresh cookie 决定（30 天），
      // 前端不再有「记住我」开关，也就没有「不记住」这条分支
      localStorage.setItem(REMEMBERED_EMAIL_KEY, values.email);

      useAuthStore.getState().setSession(accessToken, user);
      // 被守卫拦下来的深链：登录后回到原目标，而不是一律回工作台。
      // 校验放在 utils/returnTo（只接受站内绝对路径，`//evil.com` 会被当成协议
      // 相对 URL 跳出去），与注册页 Tab 透传共用同一份实现
      const target = safeReturnTo(new URLSearchParams(location.search).get('returnTo'));
      navigate(target, { replace: true });
    } catch (error) {
      const err = error as ApiError;
      if (err.code === 'EMAIL_NOT_VERIFIED') {
        message.warning('邮箱尚未验证，请查收验证邮件');
      } else if (err.code === 'RATE_LIMITED') {
        message.error('尝试过于频繁，请 15 分钟后再尝试');
      } else {
        message.error(err.message || LOGIN_COPY.submitFailed);
      }
    }
  };

  return (
    <AuthShell mode="login" privacy={COPY.auth.privacyLogin}>
      {showRegistered && registeredEmail && (
        <Alert
          type="success"
          showIcon
          closable
          className="mb-4"
          title={LOGIN_COPY.registeredTitle}
          description={LOGIN_COPY.registeredDesc(registeredEmail)}
          onClose={() => setShowRegistered(false)}
        />
      )}

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

        {/* 右「忘记密码?」 */}
        <div className="flex items-center justify-end">
          <Link to="/forgot-password" className="text-sm leading-5.5 text-primary">
            {COPY.auth.forgotPassword}
          </Link>
        </div>

        <Button
          type="primary"
          htmlType="submit"
          block
          size="large"
          loading={isSubmitting}
          className="mt-6"
        >
          {COPY.auth.loginAction}
        </Button>
      </Form>
    </AuthShell>
  );
}
