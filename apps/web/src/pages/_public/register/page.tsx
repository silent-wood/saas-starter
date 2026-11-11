/**
 * 注册页 —— 与登录页共用设计稿 S1 的卡片外壳（Tab 切到「注册」）
 *
 * 校验：`registerFormSchema` = 共享 registerBaseSchema + confirmPassword 一致性 + 团队名条件必填。
 * 提交：走真实接口 `POST /auth/register`（方案 01 §2.1 / §2.5）。
 *
 * 四种必须遵守的约束：
 * - 提交前要剔除 `confirmPassword`——它不属于接口契约，多传一个字段后端会 422。
 * - 注册成功**不下发令牌**（AC-01）：账号要等邮件激活才能登录，所以成功后只能
 *   把用户送回登录页并说明「去查收邮件」，不能假装已登录。
 * - `EMAIL_TAKEN` 要落到邮箱字段下方而不是弹 toast：这是字段级问题，
 *   用户需要知道改哪个输入框，浮层提示看完就没了。
 * - **受邀注册不显示「团队名称」**（v1.3）：从 `returnTo` 里认出 `/join?token=xxx`，
 *   把 token 作为 `inviteToken` 提交，团队在验证邮箱时加入，不建默认团队。
 *   认不出来时就是普通注册，行为与之前完全一致。
 */
import { useState } from 'react';
import { App, Button, Form, Input } from 'antd';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router';
import type { RegisterInput } from '@saas/shared';
import { AuthShell } from '@/components/auth/AuthShell';
import { COPY } from '@/constants/copy';
import { authApi } from '@/shared/api/auth';
import type { ApiError } from '@/shared/api/client';
import { inviteTokenFrom, safeReturnTo } from '@/utils/returnTo';
import { REGISTER_COPY } from './constants';
import { registerFormSchema, type RegisterFormValues } from './schema';

/** 可回填错误的字段集合：后端 422 的 path 只有落在这里面才setError，其余走 toast */
const FORM_FIELDS = new Set<keyof RegisterFormValues>([
  'tenantName',
  'name',
  'email',
  'password',
  'confirmPassword',
]);

/** 注册页：团队名称 / 姓名 / 邮箱 / 密码 + 二次确认（受邀注册时无团队名称） */
export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = App.useApp();
  const [submitting, setSubmitting] = useState(false);

  /**
   * 受邀注册的入口：`/join?token=xxx` 被 `RequireAuth` 拦到登录页时写进
   * `returnTo`，这里再取回来。`safeReturnTo` 先把非法值（`//evil.com`）滤掉，
   * `inviteTokenFrom` 再限定只认 `/join` 一个路径——两步都要，前者防跳转，
   * 后者防「随便带个 token 就跳过团队名」。
   */
  const returnTo = safeReturnTo(new URLSearchParams(location.search).get('returnTo'), '');
  const inviteToken = inviteTokenFrom(returnTo);
  const invited = inviteToken !== null;

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      // inviteToken 不渲染控件，但要进表单值：schema 的条件必填靠它判断，
      // 缺了会被当成普通注册而要求填团队名
      inviteToken: inviteToken ?? '',
      tenantName: '',
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
    mode: 'onBlur',
  });

  const onSubmit = async (values: RegisterFormValues) => {
    // 显式构造请求体而不是解构剔除：解构出的 confirmPassword 会被 lint 判成未使用，
    // 逐个列出字段还能在契约新增字段时立刻暴露「这里没跟上」
    const payload: RegisterInput = invited
      ? {
          name: values.name,
          email: values.email,
          password: values.password,
          inviteToken: inviteToken,
        }
      : {
          name: values.name,
          email: values.email,
          password: values.password,
          // 走到这里 schema 已保证非空；`?? ''` 只是给类型收口，
          // 后端对空团队名有兜底（`{昵称} 的团队`），不会建出无名租户
          tenantName: values.tenantName?.trim() ?? '',
        };

    setSubmitting(true);
    try {
      await authApi.register(payload);
      /**
       * 把邮箱带到登录页：用户下一步就是「去登录」，不该让他再敲一遍。
       * `returnTo` 必须继续带下去——受邀注册的用户登录后要回到 `/join` 完成加入，
       * 在这里丢掉的话，他得回邮件里再点一次邀请链接（F-14 / AC-28）。
       */
      const target = returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : '/login';
      navigate(target, { replace: true, state: { registeredEmail: payload.email } });
    } catch (error) {
      const err = error as ApiError;
      if (err.code === 'EMAIL_TAKEN') {
        setError('email', { message: err.message });
      } else if (err.code === 'VALIDATION_FAILED' && err.details?.length) {
        // 前后端共用同一份 schema，正常不会走到这里；真走到了说明两侧版本不一致，
        // 逐字段回填比只弹「请求参数校验失败」有用得多
        let mapped = false;
        for (const detail of err.details) {
          const field = detail.path as keyof RegisterFormValues;
          if (FORM_FIELDS.has(field)) {
            setError(field, { message: detail.message });
            mapped = true;
          }
        }
        if (!mapped) void message.error(err.message || REGISTER_COPY.submitFailed);
      } else if (err.code === 'RATE_LIMITED') {
        void message.error('操作过于频繁，请稍后再试');
      } else {
        void message.error(err.message || REGISTER_COPY.submitFailed);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell mode="register" privacy={COPY.auth.privacyRegister}>
      <Form
        className="auth-form"
        layout="vertical"
        onFinish={() => void handleSubmit(onSubmit)()}
        requiredMark={false}
      >
        {/*
          受邀注册的说明条。这里**不显示团队名**——注册页拿不到（`GET /invites/:token`
          需要登录，05 AC-06 明确不做匿名预览），说了是哪个团队反而要开一个探测口。
          用户登录后在 `/join` 和顶栏能看到完整信息。
        */}
        {invited && (
          <div className="mb-4 rounded-md border border-solid border-primary bg-primary-bg px-3 py-2 text-xs leading-[18px] text-primary">
            {REGISTER_COPY.inviteHint}
          </div>
        )}

        {/* 受邀注册不建默认团队，这一格没有意义；隐藏而不是置灰，避免用户以为漏填了 */}
        {!invited && (
          <Form.Item
            label={<RequiredLabel text={COPY.auth.tenantName} />}
            validateStatus={errors.tenantName ? 'error' : undefined}
            help={errors.tenantName?.message}
            extra={errors.tenantName ? undefined : REGISTER_COPY.tenantNameHint}
          >
            <Controller
              name="tenantName"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  // 字段在契约里已改为可选，value 可能是 undefined——不兜住会变成
                  // 非受控组件，React 会警告且输入后不再受控
                  value={field.value ?? ''}
                  placeholder="如：星河科技 / 我的团队"
                />
              )}
            />
          </Form.Item>
        )}

        <Form.Item
          label={<RequiredLabel text={COPY.auth.name} />}
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
          label={<RequiredLabel text={COPY.auth.email} />}
          validateStatus={errors.email ? 'error' : undefined}
          help={errors.email?.message}
          extra={errors.email ? undefined : REGISTER_COPY.emailHint}
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
          label={<RequiredLabel text={COPY.auth.password} />}
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
          label={<RequiredLabel text={COPY.auth.confirmPassword} />}
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

        <Button
          type="primary"
          htmlType="submit"
          block
          size="large"
          loading={submitting}
          className="mt-6"
        >
          {COPY.auth.registerAction}
        </Button>
      </Form>
    </AuthShell>
  );
}

/**
 * 必填标记：设计稿 R1 的星号在标签文字**之后**（`团队名称*`），
 * 而 antd 默认的 `requiredMark` 在文字之前，所以关掉默认标记自己拼。
 */
function RequiredLabel({ text }: { text: string }) {
  return (
    <span>
      {text}
      <span className="ml-0.5 text-danger" aria-hidden="true">
        *
      </span>
    </span>
  );
}
