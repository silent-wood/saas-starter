/**
 * 重置密码（设计稿 R9 → R10）
 *
 * 关键约束（方案 02）：
 * - 令牌只从 URL 读，且**不校验格式**：不存在 / 已用 / 已过期在服务端统一抛 `TOKEN_INVALID`，
 *   前端只负责把这一种失败翻译成 R10 的失效态（AC-05/AC-09 合并成一个错误态）。
 * - 成功后必须**先清本地会话再跳登录**（F-07）：后端已在同一事务里吊销该用户全部 refresh，
 *   但浏览器内存里可能还留着旧 access，不清就会出现「密码改了、页面还是登录态」。
 * - 没有令牌时直接进失效态，不发请求——URL 被截断是最常见的失效原因，没必要打一趟空请求。
 */
import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { App, Button } from 'antd';
import { ProForm, ProFormText, type ProFormInstance } from '@ant-design/pro-components';
import { CheckOutlined, CloseCircleOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { AuthCard, StateIcon } from '@/components/auth/AuthCard';
import { authApi } from '@/shared/api/auth';
import { useAuthStore } from '@/stores/auth';
import { useTenantStore } from '@/stores/tenant';
import type { ApiError } from '@/shared/api/client';
import { RESET_COPY } from './constants';
import { resetPasswordFormSchema, type ResetPasswordFormValues } from './schema';

export const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  const [invalid, setInvalid] = useState(!token);
  const [submitting, setSubmitting] = useState(false);
  /** 实时密码值，驱动强度提示的「已满足 / 未满足」两态 */
  const [password, setPassword] = useState('');

  const formRef = useRef<ProFormInstance<ResetPasswordFormValues>>(null);

  const onSubmit = async (values: ResetPasswordFormValues) => {
    /**
     * ProForm 只拦「必填」，强度与两次一致仍以 shared 的 zod 为唯一来源。
     * 不复用共享 schema 会出现「注册能过的密码、重置过不了」的漂移。
     */
    const parsed = resetPasswordFormSchema.safeParse(values);
    if (!parsed.success) {
      void message.error(parsed.error.issues[0]?.message ?? '请检查输入');
      return;
    }

    setSubmitting(true);
    try {
      await authApi.resetPassword({ token, password: values.password });
      useAuthStore.getState().clear();
      useTenantStore.getState().clear();
      queryClient.clear();
      void message.success(RESET_COPY.success);
      navigate('/login', { replace: true });
    } catch (error) {
      const err = error as ApiError;
      if (err.code === 'TOKEN_INVALID') {
        setInvalid(true);
      } else {
        message.error(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── R10 链接已失效 ──────────────────────────────────────────
  if (invalid) {
    return (
      <AuthCard brand={false}>
        <StateIcon icon={<CloseCircleOutlined />} tone="danger" />

        <div className="mt-4 text-center text-base leading-6 font-semibold text-ink">
          {RESET_COPY.invalidTitle}
        </div>
        <div className="mt-1 text-center text-xs leading-4.5 text-ink-3">
          {RESET_COPY.invalidDesc}
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <Button type="primary" block onClick={() => navigate('/forgot-password')}>
            {RESET_COPY.reapply}
          </Button>
          <Button block onClick={() => navigate('/login')}>
            {RESET_COPY.backToLogin}
          </Button>
        </div>
      </AuthCard>
    );
  }

  // ── R9 设置新密码 ───────────────────────────────────────────
  return (
    <AuthCard slogan={false}>
      <div className="mt-6 text-center">
        <div className="text-base leading-6 font-semibold text-ink">{RESET_COPY.title}</div>
        <div className="mt-1 text-xs leading-4.5 text-ink-3">{RESET_COPY.desc}</div>
      </div>
      <ProForm
        name="resetForm"
        formRef={formRef}
        submitter={false}
        onFinish={onSubmit}
        onValuesChange={(_, all) => setPassword(String(all.password ?? ''))}
      >
        <ProFormText.Password
          label={RESET_COPY.passwordLabel}
          extra={<PasswordHints value={password} />}
          width="md"
          name="password"
          placeholder={RESET_COPY.passwordPlaceholder}
        />
        <ProFormText.Password
          label={RESET_COPY.confirmLabel}
          width="md"
          name="confirmPassword"
          placeholder={RESET_COPY.confirmPlaceholder}
        />
        {/* 他端下线提醒：这是本次操作的副作用，必须在提交前告知，不能只在成功后才说 */}
        <div className="mb-4 flex items-start gap-2 rounded-md bg-primary-bg px-3 py-2 text-xs leading-[18px] text-ink-2">
          <InfoCircleOutlined className="mt-0.75 text-primary" />
          <span>{RESET_COPY.notice}</span>
        </div>
        <Button type="primary" htmlType="submit" block size="large" loading={submitting}>
          {RESET_COPY.submit}
        </Button>
      </ProForm>

      <div className="mt-4 text-center">
        <Link to="/login" className="text-sm leading-5.5 text-primary">
          {RESET_COPY.backToLogin}
        </Link>
      </div>
    </AuthCard>
  );
};

/**
 * 密码强度提示（R9 输入框下方两行）
 *
 * 未满足时灰色、满足时绿色打勾——只做「是否已满足」的即时反馈，
 * 不引入强度打分条：契约里就是两条硬规则，多一档「中/弱」没有对应的校验依据。
 */
function PasswordHints({ value }: { value: string }) {
  const lengthOk = value.length >= 8 && value.length <= 64;
  const charsetOk = /[A-Za-z]/.test(value) && /\d/.test(value);

  return (
    <div className="text-xs leading-4.5">
      <HintItem ok={lengthOk} text={RESET_COPY.hintLength} />
      <HintItem ok={charsetOk} text={RESET_COPY.hintCharset} />
    </div>
  );
}

function HintItem({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className={`flex items-center gap-1 ${ok ? 'text-success' : 'text-ink-3'}`}>
      <CheckOutlined className={ok ? 'opacity-100' : 'opacity-30'} />
      <span>{text}</span>
    </div>
  );
}
