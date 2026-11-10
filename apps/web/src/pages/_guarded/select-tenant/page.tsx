/**
 * 进入工作台前的落点页（`/select-tenant`，需登录但无侧栏布局）
 *
 * 它已经不是多租户的必经步骤：`useTenantRouting` 会直接沿用存储里的租户、失效时
 * 回落到列表第一个，正常情况下用户不会看到这一屏。现在的三种进入方式：
 * - 被 owner/admin 移出团队 → 业务请求 403 `TENANT_MISMATCH` → 清上下文后落这里
 * - 一个团队都没有 → 进 `/app` 没有可用上下文，必须有出口
 * - 手动访问 → 整页列表形态
 *
 * 页面因此有两种形态：
 * - **有团队**：列表 + 当前项勾选（整页切换）
 * - **无团队**：引导创建团队。没有这个出口，被移出的用户会只剩「退出登录」一条路，
 *   而重新加入还得找人发邀请 —— 自己建一个团队是最短的恢复路径
 *
 * 数据用 react-query 的 `['tenants']` 键，与 `useTenantRouting` 共用同一份缓存：
 * 跳过来时列表已在缓存里，不会闪一下 loading。
 *
 * 切换/创建后只改 store 的 `currentTenantId` 并清业务缓存，不带 token：租户不进
 * access token，而是每个请求带 `X-Tenant-Id`（见 shared/contracts/tenant.ts 的说明）。
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { App, Button, Input, Spin } from 'antd';
import { CheckOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { CreateTenantInput, CreateTenantResult } from '@saas/shared';
import { AuthCard } from '@/components/auth/AuthCard';
import { ROLE_LABEL } from '@/constants/role';
import { useLogout } from '@/hooks/useLogout';
import { useSwitchTenant } from '@/hooks/useSwitchTenant';
import type { ApiError } from '@/shared/api/client';
import { createTenant, listTenants } from '@/shared/api/tenants';
import { useTenantStore } from '@/stores/tenant';
import { SELECT_TENANT_COPY } from './constants';

export const SelectTenant = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const logout = useLogout();
  const switchTenant = useSwitchTenant();

  const currentTenantId = useTenantStore((s) => s.currentTenantId);
  const setTenants = useTenantStore((s) => s.setTenants);

  const { data, isLoading } = useQuery({ queryKey: ['tenants'], queryFn: listTenants });

  useEffect(() => {
    if (data) setTenants(data.items);
  }, [data, setTenants]);

  const items = data?.items ?? [];
  const empty = !isLoading && items.length === 0;

  const [name, setName] = useState('');
  const create = useMutation<CreateTenantResult, ApiError, CreateTenantInput>({
    mutationFn: createTenant,
    onSuccess: async (tenant) => {
      // 先把新团队写进列表，再切上下文：切完立刻渲染时下拉/菜单已经能读到它
      setTenants([...items, tenant]);
      await switchTenant(tenant.id);
      message.success(`已创建「${tenant.name}」`);
      navigate('/app', { replace: true });
    },
    onError: (error) => message.error(error.message),
  });

  const enter = async (id: string) => {
    await switchTenant(id);
    navigate('/app', { replace: true });
  };

  const submitCreate = () => {
    const value = name.trim();
    // 与契约（2–30）同源；前端先拦一次，避免为一个空输入发请求
    if (value.length < 2) {
      message.warning('团队名称至少 2 个字符');
      return;
    }
    create.mutate({ name: value });
  };

  return (
    <AuthCard>
      <div className="mt-6 text-center">
        <div className="text-base leading-6 font-semibold text-ink">
          {empty ? SELECT_TENANT_COPY.empty : SELECT_TENANT_COPY.title}
        </div>
        <div className="mt-1 text-xs leading-[18px] text-ink-3">
          {empty ? SELECT_TENANT_COPY.emptyHint : SELECT_TENANT_COPY.desc}
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-2">
        {isLoading && (
          <div className="flex flex-col items-center py-6">
            <Spin size="small" />
            <div className="mt-2 text-xs leading-[18px] text-ink-3">
              {SELECT_TENANT_COPY.loading}
            </div>
          </div>
        )}

        {/*
          空列表是合法状态（成员被移出所有团队），不是错误。这里给的是「自救路径」
          而不是提示语：用户此时没有任何可进入的团队，只能建一个或等邀请。
        */}
        {empty && (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submitCreate();
            }}
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              placeholder={SELECT_TENANT_COPY.namePlaceholder}
              aria-label={SELECT_TENANT_COPY.nameLabel}
            />
            <Button type="primary" htmlType="submit" block loading={create.isPending}>
              {create.isPending ? SELECT_TENANT_COPY.creating : SELECT_TENANT_COPY.create}
            </Button>
          </form>
        )}

        {empty && (
          <div className="mt-1 rounded-md border border-dashed border-split px-3 py-2 text-xs leading-[18px] text-ink-3">
            {SELECT_TENANT_COPY.inviteHint}
          </div>
        )}

        {items.map((tenant) => {
          const active = tenant.id === currentTenantId;
          return (
            <button
              key={tenant.id}
              type="button"
              onClick={() => void enter(tenant.id)}
              className={`flex w-full cursor-pointer items-center gap-3 rounded-md border border-solid px-3 py-2 text-left transition-colors ${
                active
                  ? 'border-primary bg-primary-bg'
                  : 'border-split bg-transparent hover:border-primary'
              }`}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary-bg text-xs font-medium text-primary">
                {tenant.name.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm leading-[22px] font-medium text-ink">
                  {tenant.name}
                </div>
                <div className="text-xs leading-[18px] text-ink-3">
                  {ROLE_LABEL[tenant.role] ?? tenant.role}
                </div>
              </div>
              {active && <CheckOutlined className="shrink-0 text-primary" />}
            </button>
          );
        })}
      </div>

      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={() => void logout()}
          className="cursor-pointer border-0 bg-transparent p-0 text-sm leading-[22px] text-primary"
        >
          {SELECT_TENANT_COPY.logout}
        </button>
      </div>
    </AuthCard>
  );
};
