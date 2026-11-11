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

  const accept = useMutation<AcceptInviteResult, ApiError>({
    mutationFn: () => memberApi.acceptInvite({ token }),
    onSuccess: async (tenant) => {
      // 先补进列表再切：switchTenant 不清租户列表，缺这一行头像下拉会空
      setTenants([...tenants.filter((t) => t.id !== tenant.id), tenant]);
      await switchTenant(tenant.id);
      message.success(`已加入「${tenant.name}」`);
      navigate('/app', { replace: true });
    },
    onError: (error) => message.error(errorText(error)),
  });

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
   * 已接受：**不能断言「你已在该团队中」**。
   *
   * `remove()` 只改 `membership.status`，不动 invite，所以被移出的人点旧链接时
   * `status` 仍是 `accepted`，会走到这里。原先写「你已在该团队中，可以直接切换过去」
   * 在那个场景下是假话——他一个团队都没有。改成只陈述事实（这条邀请用过了），
   * 「返回工作台」两种情况都去对了地方：还在团队就正常进，不在就落到引导页。
   */
  if (invite.accepted) {
    return renderNotice(
      '这条邀请已被使用',
      `「${invite.tenantName}」的邀请已经用过。仍在团队中可直接返回工作台；若已不在该团队，请联系管理员重新发送邀请。`,
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

      <Button
        type="primary"
        block
        className="mt-6"
        loading={accept.isPending}
        onClick={() => accept.mutate()}
      >
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
