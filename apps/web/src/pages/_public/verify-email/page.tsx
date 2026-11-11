/**
 * 邮箱验证页（邮件链接的落点，`/verify-email?token=xxx`）
 *
 * 这个页面一进来就发请求，没有表单，成功后**直接登录进工作台**（v1.4）。
 * 四个必须注意的点：
 * - **StrictMode 双执行**：开发模式下 effect 跑两次，第二次令牌已被消费会返回 `TOKEN_INVALID`，
 *   页面就会「成功一下又变失败」。用 ref 门闩保证只提交一次，这不是保险而是必需。
 * - **验证即登录**：接口现在和 `login` 一样返回 `accessToken`（refresh 走 httpOnly cookie），
 *   拿到后写 store 即可。不要再插一个「去登录」按钮——那正是注册流程里被诟病的那一步：
 *   注册 → 登录页 → 收信 → 验证 → 登录页 → 手打密码，五次跳转只为了回到起点。
 * - **用 `replace` 跳转**：令牌已被消费，用户按返回键回到 `/verify-email?token=xxx`
 *   只会看到「链接无效」，把这一步从历史里抹掉。
 * - **三态合并**：令牌不存在 / 已用 / 已过期，服务端统一抛 `TOKEN_INVALID`，
 *   前端也就只有「成功」和「失效」两态，不做更细的区分（区分了也没有可执行差异）。
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button, Spin } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import { AuthCard, StateIcon } from '@/components/auth/AuthCard';
import { authApi } from '@/shared/api/auth';
import { useAuthStore } from '@/stores/auth';
import { VERIFY_COPY } from './constants';

type State = 'verifying' | 'invalid';

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
      .then(({ accessToken, user }) => {
        /**
         * 直接覆盖当前会话。这里不判断「是否已登录为别人」：点开自己邮箱里的验证链接
         * 意图已经足够明确，加一层确认弹窗反而把"顺手在旧设备上激活新账号"这种
         * 正常场景变成负担。
         */
        useAuthStore.getState().setSession(accessToken, user);
        navigate('/app', { replace: true });
      })
      .catch(() => setState('invalid'));
  }, [token, navigate]);

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
