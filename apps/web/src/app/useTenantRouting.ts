import { listTenants } from '@/shared/api/tenants';
import { useTenantStore } from '@/stores/tenant';
import { useQuery } from '@tanstack/react-query';
import { App } from 'antd';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';

/**
 * 租户落点：进入工作台前确定「当前用哪个租户」。
 *
 * 规则不需要用户参与，按优先级取第一条命中的：
 * 1. 存储里的 `currentTenantId` 仍在列表中 → 沿用它（刷新、重开页面都保持上次选择）
 * 2. 没有、或已失效（被移出该团队）→ 取列表第一个，并写回存储
 *
 * `GET /tenants` 按 `lastActiveAt` 降序返回，所以「第一个」就是最近使用的那个，
 * 首次登录落到这里也是最合理的默认值。
 *
 * 只有「一个团队都没有」才需要用户介入：跳 `/select-tenant`，那里提供创建团队
 * 与（后续）邀请加入两个出口。这个页面因此不是多租户的必经步骤，而是自救/兜底页。
 *
 * 「刚被移除」的提示也在这里发：请求层只置位 `removedNotice`，拦截器里拿不到
 * antd 的 message 上下文，且并发 403 会连弹多条；落点层是唯一知道后续结果
 * （有没有别的团队可进）的地方，文案能说准。
 */
export function useTenantRouting() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { data, isError } = useQuery({ queryKey: ['tenants'], queryFn: listTenants });
  const current = useTenantStore((s) => s.currentTenantId);

  useEffect(() => {
    // 拉取失败同样要给出结论：否则 tenantsLoaded 永远为 false，权限守卫会一直停在
    // 加载态（比误判 403 更难排查）。按「没有租户」落定，由守卫渲染 403。
    if (isError) {
      useTenantStore.getState().setTenants([]);
      return;
    }
    if (!data) return;

    const { items } = data;
    const store = useTenantStore.getState();
    store.setTenants(items);

    // 消费一次性的「被移出」信号：提示内容取决于还剩几个团队
    const removed = store.removedNotice;
    if (removed) store.clearRemovedNotice();

    if (items.length === 0) {
      /**
       * 顺手清掉失效的 `currentTenantId`。
       *
       * 它来自 localStorage（持久化），被移出后仍然指着那个已经不存在的团队。
       * 不清的话，之后任何一个业务请求都会继续带这个 `X-Tenant-Id` 换回一次 403，
       * 而拦截器里的兜底只看「有没有 currentTenantId」——有值就当「被移除」处理，
       * 一边刷提示一边清缓存，页面看着像在抽风。
       */
      if (current !== null) store.clearCurrent();
      if (removed) {
        message.warning('你已不在该团队中，请创建团队或通过邀请加入');
      }
      navigate('/select-tenant', { replace: true });
      return;
    }

    const valid = current !== null && items.some((t) => t.id === current);
    if (!valid) {
      store.setCurrent(items[0].id);
      // 还有别的团队可去：直接落到最近使用的那个，并说明切换原因
      if (removed) message.info(`你已不在原团队中，已切换到「${items[0].name}」`);
    }
  }, [data, isError, current, navigate, message]);
}
