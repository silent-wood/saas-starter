/**
 * 邮箱验证结果页（设计稿 R11 / R12）
 *
 * 这个页面一进来就发请求，没有表单。三个必须注意的点：
 * - **StrictMode 双执行**：开发模式下 effect 跑两次，第二次令牌已被消费会返回 `TOKEN_INVALID`，
 *   页面就会「成功一下又变失败」。用 ref 门闩保证只提交一次，这不是保险而是必需。
 * - **三态合并**：令牌不存在 / 已用 / 已过期，服务端统一抛 `TOKEN_INVALID`，
 *   前端也就只有「成功」和「失效」两态，不做更细的区分（区分了也没有可执行差异）。
 * - 成功不等于已登录：接口只返回 `{ verified, tenantId }`，没有 access token，
 *   所以主按钮去登录页而不是直接进工作台。
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button, Spin } from 'antd';
import { CheckOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { AuthCard, StateIcon } from '@/components/auth/AuthCard';
import { authApi } from '@/shared/api/auth';
import { VERIFY_COPY } from './constants';

type State = 'verifying' | 'success' | 'invalid';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();
  /**
   * 初始态由 token 是否在场直接推导：没有令牌时连请求都不用发，直接是失效态。
   * 不在 effect 里 setState 走这一步——那会多一轮渲染，也会触发
   * `react-hooks/set-state-in-effect`（同步 setState 造成的级联渲染）。
   */
  const [state, setState] = useState<State>(() => (token ? 'verifying' : 'invalid'));
  const submitted = useRef(false);

  useEffect(() => {
    if (!token || submitted.current) return;
    submitted.current = true;

    authApi
      .verifyEmail({ token })
      .then(() => setState('success'))
      .catch(() => setState('invalid'));
  }, [token]);

  if (state === 'verifying') {
    return (
      <AuthCard brand={false}>
        <div className="flex flex-col items-center py-8">
          <Spin />
          <div className="mt-4 text-sm leading-[22px] text-ink-3">{VERIFY_COPY.verifying}</div>
        </div>
      </AuthCard>
    );
  }

  // ── R11 验证成功 ────────────────────────────────────────────
  if (state === 'success') {
    return (
      <AuthCard brand={false}>
        <StateIcon icon={<CheckOutlined />} tone="success" />

        <div className="mt-4 text-center text-base leading-6 font-semibold text-ink">
          {VERIFY_COPY.successTitle}
        </div>
        <div className="mt-1 text-center text-xs leading-[18px] text-ink-3">
          {VERIFY_COPY.successDesc}
        </div>

        {/*
          这里**不再展示「团队已创建」卡片**（v1.3）：受邀注册验证后是加入别人的团队、
          根本没有新建租户，而接口只返回 `{ verified, tenantId }`，前端分不出是哪种。
          两种情况都成立的说法只有「邮箱已验证，请登录」，所以只留这一句。
          团队信息等登录后在顶栏和头像下拉里看。
        */}
        <Button type="primary" block className="mt-6" onClick={() => navigate('/login')}>
          {VERIFY_COPY.successAction}
        </Button>
      </AuthCard>
    );
  }

  // ── R12 链接无效 ────────────────────────────────────────────
  return (
    <AuthCard brand={false}>
      <StateIcon icon={<ClockCircleOutlined />} tone="warning" />

      <div className="mt-4 text-center text-base leading-6 font-semibold text-ink">
        {VERIFY_COPY.invalidTitle}
      </div>
      <div className="mt-1 text-center text-xs leading-[18px] text-ink-3">
        {VERIFY_COPY.invalidDesc}
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <Button type="primary" block onClick={() => navigate('/register')}>
          {VERIFY_COPY.invalidAction}
        </Button>
        <Button block onClick={() => navigate('/login')}>
          {VERIFY_COPY.invalidBack}
        </Button>
      </div>

      <div className="mt-4 text-center text-xs leading-[18px] text-ink-3">
        {VERIFY_COPY.invalidRetryHint}
      </div>
    </AuthCard>
  );
}
