/**
 * 找回密码：申请重置链接（设计稿 R7 → R8）
 *
 * 关键约束（方案 02）：
 * - **防枚举**：邮箱存在与否都返回 200 `{ ok: true }`，因此这里不能「查到就给成功页、查不到就报错」，
 *   只能统一进已发送态并显示「若 xxx 已注册」。页面本身不能成为账号探测接口（AC-01）。
 * - 重发冷却：AC-11 的限流是 5 次 / 15 分钟（后端按 IP），前端再加 60s 冷却挡住连点，
 *   冷却只是体验层，真正的拦截在服务端。
 * - 冷却用 setTimeout 链而非 setInterval：StrictMode 下 effect 会执行两次，
 *   interval 容易叠出多个计时器导致秒数跳变。
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { App, Button, Form, Input } from 'antd';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { MailOutlined } from '@ant-design/icons';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@saas/shared';
import { AuthCard, StateIcon } from '@/components/auth/AuthCard';
import { COPY } from '@/constants/copy';
import { authApi } from '@/shared/api/auth';
import type { ApiError } from '@/shared/api/client';
import { FORGOT_COPY, RESEND_COOLDOWN_SECONDS } from './constants';

export const ForgotPassword = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();

  /** 已发送态的收件邮箱；null 表示还停在表单态 */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
    mode: 'onBlur',
  });

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const send = async (email: string) => {
    setSubmitting(true);
    try {
      await authApi.forgotPassword({ email });
      setSentTo(email);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      const err = error as ApiError;
      message.error(err.code === 'RATE_LIMITED' ? FORGOT_COPY.rateLimited : err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── R8 邮件已发送 ────────────────────────────────────────────
  if (sentTo) {
    return (
      <AuthCard brand={false} footer={FORGOT_COPY.sentFooter}>
        <StateIcon icon={<MailOutlined />} tone="primary" />

        <div className="mt-4 text-center text-base leading-6 font-semibold text-ink">
          {FORGOT_COPY.sentTitle}
        </div>
        <div className="mt-1 text-center text-xs leading-[18px] text-ink-3">
          <div>
            {FORGOT_COPY.sentDescPrefix} <span className="font-medium text-ink">{sentTo}</span>{' '}
            {FORGOT_COPY.sentDescSuffix}
          </div>
          <div>{FORGOT_COPY.sentDescExpire}</div>
          <div>{FORGOT_COPY.sentDescSpam}</div>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <Button
            block
            disabled={cooldown > 0}
            loading={submitting}
            onClick={() => void send(sentTo)}
          >
            {cooldown > 0 ? `${FORGOT_COPY.resend}（${cooldown}s）` : FORGOT_COPY.resend}
          </Button>
          <Button block onClick={() => navigate('/login')}>
            {FORGOT_COPY.backToLogin}
          </Button>
        </div>
      </AuthCard>
    );
  }

  // ── R7 申请重置 ─────────────────────────────────────────────
  return (
    <AuthCard>
      <div className="mt-6 text-center">
        <div className="text-base leading-6 font-semibold text-ink">{FORGOT_COPY.title}</div>
        <div className="mt-1 text-xs leading-[18px] text-ink-3">{FORGOT_COPY.desc}</div>
      </div>

      <Form
        className="auth-form mt-6"
        layout="vertical"
        onFinish={() => void handleSubmit((values) => void send(values.email))()}
        requiredMark={false}
      >
        <Form.Item
          label={COPY.auth.email}
          validateStatus={errors.email ? 'error' : undefined}
          help={errors.email?.message}
          extra={errors.email ? undefined : FORGOT_COPY.hint}
        >
          <Controller
            name="email"
            control={control}
            render={({ field }) => (
              <Input {...field} placeholder="you@example.com" autoComplete="email" />
            )}
          />
        </Form.Item>

        <Button
          type="primary"
          htmlType="submit"
          block
          size="large"
          loading={submitting}
          className="mt-2"
        >
          {FORGOT_COPY.submit}
        </Button>
      </Form>

      <div className="mt-4 text-center">
        <Link to="/login" className="text-sm leading-[22px] text-primary">
          {FORGOT_COPY.backToLogin}
        </Link>
      </div>
    </AuthCard>
  );
};
