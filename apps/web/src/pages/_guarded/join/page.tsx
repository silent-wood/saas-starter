/**
 * 接受邀请页（`/join?token=xxx`，需登录但无侧栏布局）
 *
 * 三种状态：
 * - 预览成功：展示「谁邀请你加入哪个团队 + 什么角色」，一键加入
 * - 邀请失效（410 `TOKEN_INVALID`）：链接被撤销/轮换/过期/已被用过，给回工作台的出口
 * - 邮箱不匹配（409 `MEMBER_STATE_INVALID`）：链接被转发给了别人，提示用目标邮箱登录
 *
 * 未登录访问由 `_guarded` 的 `RequireAuth` 拦到登录页，并带 `returnTo=/join?token=xxx`，
 * 登录后自动回到这一屏 —— 所以这里不需要处理「没有令牌」的分支，只管已登录的情况。
 *
 * 加入成功后要把新团队写进 store 再切换：`switchTenant` 只改 id 不清列表，
 * 列表里没有这个团队时头像下拉会渲染成空。
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import { App, Button, Spin, Typography } from 'antd';
import { ERROR_CODES } from '@saas/shared';
import type { AcceptInviteResult } from '@saas/shared';
import { AuthCard } from '@/components/auth/AuthCard';
import { ROLE_LABEL } from '@/constants/role';
import { useSwitchTenant } from '@/hooks/useSwitchTenant';
import type { ApiError } from '@/shared/api/client';
import { errorText } from '@/shared/api/errorText';
import { memberApi } from '@/shared/api/member';
import { useTenantStore } from '@/stores/tenant';

export const JoinPage = () => {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { message } = App.useApp();
  const switchTenant = useSwitchTenant();
  const setTenants = useTenantStore((s) => s.setTenants);
  const tenants = useTenantStore((s) => s.tenants);

  const preview = useQuery({
    queryKey: ['invite', token],
    queryFn: () => memberApi.previewInvite(token),
    // 没有 token 就别发请求（直接走「链接无效」的兜底文案）
    enabled: token.length > 0,
    // 失效类错误重试没有意义，重试还会让用户多等 3 轮
    retry: false,
  });

  /**
   * 进入团队：手动「加入团队」与自动放行共用这一段。
   * 先补列表再切换 —— `switchTenant` 不清租户列表，缺这一行头像下拉会渲染成空。
   */
  const enterTenant = async (tenant: AcceptInviteResult) => {
    setTenants([...tenants.filter((t) => t.id !== tenant.id), tenant]);
    await switchTenant(tenant.id);
    message.success(`已进入「${tenant.name}」`);
    navigate('/app', { replace: true });
  };

  // 两个回调都不挂在 mutation 上：手动路径要 toast，自动路径要落成卡片而不是弹窗，
  // 挂在全局 onError 里会变成「卡片 + 同样文案的 toast」各说一遍
  const accept = useMutation<AcceptInviteResult, ApiError, void>({
    mutationFn: () => memberApi.acceptInvite({ token }),
  });

  const join = () =>
    accept.mutate(undefined, {
      onSuccess: (tenant) => void enterTenant(tenant),
      onError: (error) => message.error(errorText(error)),
    });

  /**
   * 已接受的邀请**自动放行一次**，成功就直接进团队，不必让用户先看到一句
   * 「这条邀请已被使用」再自己找路回工作台。
   *
   * 为什么不给后端加「我是不是成员」字段：`acceptInvite` 对「已是 active 成员」
   * 本来就是幂等返回（05 AC-07），调一次就能分辨三种结果，契约不用动：
   *  - 200 → 他确实是成员（重复点链接、或受邀注册验证邮箱后就已入团），切租户进工作台
   *  - 410 → 邀请用过了但成员关系已不在（被移出），提示找管理员重发
   *  - 409 → 邮箱不匹配 / 被禁用，直接说后端给的原因
   *
   * 结果落在本地 state（`autoError`）而不是读 `accept.isError`：这三条分支的唯一输入
   * 就是「失败原因」，把它直接存下来，渲染不依赖 mutation 状态在多次重渲染之间的同步时机。
   *
   * 自动这条不走 `accept`（那个 mutation 只服务「加入团队」按钮），也不在 effect 里
   * 直接引用 `enterTenant`：`switchTenant` 每次渲染都是新函数，把它带进依赖会让 effect
   * 每帧重跑一遍。改成走 ref 取最新值——effect 依赖只剩 `token` 与
   * `preview.data.accepted` 两个原语，去重靠 `autoTried` 门闩。
   */
  const [autoError, setAutoError] = useState<ApiError | null>(null);
  const enterTenantRef = useRef(enterTenant);
  useEffect(() => {
    // 无依赖数组：每次渲染后把最新的闭包写进 ref，供下面的 effect 调用
    enterTenantRef.current = enterTenant;
  });

  const autoTried = useRef(false);
  useEffect(() => {
    if (!preview.data?.accepted || autoTried.current) return;
    autoTried.current = true;
    memberApi
      .acceptInvite({ token })
      .then((tenant) => void enterTenantRef.current(tenant))
      .catch((error: ApiError) => setAutoError(error));
  }, [preview.data?.accepted, token]);

  const leave = () => navigate('/app', { replace: true });

  const copy = {
    title: '加入团队',
    desc: '确认下面的信息后即可加入',
  };

  // 失效与邮箱不匹配都渲染同一张卡，只是文案不同
  const renderNotice = (title: string, desc: string) => (
    <AuthCard brand={false}>
      <div className="text-center">
        <div className="text-base leading-6 font-semibold text-ink">{title}</div>
        <div className="mt-2 text-xs leading-[18px] text-ink-3">{desc}</div>
        <Button className="mt-6" block onClick={leave}>
          返回工作台
        </Button>
      </div>
    </AuthCard>
  );

  if (!token) {
    return renderNotice('邀请链接无效', '链接缺少邀请码，请向管理员索取完整的邀请链接。');
  }

  if (preview.isLoading) {
    return (
      <AuthCard brand={false}>
        <div className="flex flex-col items-center py-4">
          <Spin size="small" />
          <div className="mt-2 text-xs leading-[18px] text-ink-3">正在校验邀请…</div>
        </div>
      </AuthCard>
    );
  }

  if (preview.error || !preview.data) {
    const code = (preview.error as ApiError | null)?.code;
    return code === ERROR_CODES.TOKEN_INVALID
      ? renderNotice(
          '邀请已失效',
          '链接可能已被撤销、被重新发送覆盖，或已超过 7 天有效期。请联系管理员重新发送。',
        )
      : renderNotice('无法打开邀请', errorText(preview.error));
  }

  const invite = preview.data;

  /**
   * 已接受：交给上面的自动放行去判定，只有**确实进不去**时才提示。
   *
   * 不能无条件说「你已在该团队中」（`remove()` 只改 membership、不动 invite，
   * 被移出的人点旧链接时 `status` 仍是 `accepted`，那句话在那个场景下是假的），
   * 也不要无条件说「已被使用」—— 入团后正常再点一次链接的人会看到这句误导文案，
   * 而 `acceptInvite` 的幂等分支本来就能把他直接送进团队。
   */
  if (invite.accepted) {
    if (autoError) {
      return autoError.code === ERROR_CODES.TOKEN_INVALID
        ? renderNotice(
            '这条邀请已被使用',
            `「${invite.tenantName}」的邀请已经用过，且你当前不在该团队中。请联系管理员重新发送邀请。`,
          )
        : renderNotice('无法进入团队', errorText(autoError));
    }
    // 自动放行进行中（成功后立即被 navigate 带走，这一屏通常只闪一下）
    return (
      <AuthCard brand={false}>
        <div className="flex flex-col items-center py-4">
          <Spin size="small" />
          <div className="mt-2 text-xs leading-[18px] text-ink-3">
            正在确认你在「{invite.tenantName}」的成员身份…
          </div>
        </div>
      </AuthCard>
    );
  }
  if (invite.expired) {
    return renderNotice(
      '邀请已过期',
      `这条邀请（${invite.tenantName}）已超过 7 天有效期，请联系管理员重新发送。`,
    );
  }

  return (
    <AuthCard brand={false}>
      <div className="text-center">
        <div className="text-base leading-6 font-semibold text-ink">{copy.title}</div>
        <div className="mt-1 text-xs leading-[18px] text-ink-3">{copy.desc}</div>
      </div>

      <div className="mt-6 rounded-md border border-solid border-split px-3 py-3">
        <div className="text-sm leading-[22px] font-medium text-ink">{invite.tenantName}</div>
        <div className="mt-1 text-xs leading-[18px] text-ink-3">
          {invite.inviterName} 邀请你以「{ROLE_LABEL[invite.role] ?? invite.role}」身份加入
        </div>
        <Typography.Text type="secondary" className="mt-2 block text-xs">
          邀请发送给 {invite.email}，需用该邮箱登录后接受。
        </Typography.Text>
      </div>

      <Button type="primary" block className="mt-6" loading={accept.isPending} onClick={join}>
        加入团队
      </Button>
      <div className="mt-3 text-center">
        <Button type="link" size="small" onClick={leave}>
          暂不加入
        </Button>
      </div>
    </AuthCard>
  );
};

export default JoinPage;
