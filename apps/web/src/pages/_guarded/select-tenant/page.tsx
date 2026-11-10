/**
 * 选择团队（`/select-tenant`，需登录但无侧栏布局）
 *
 * 进入条件由 `useTenantRouting` 决定：登录后 `GET /tenants` 返回多个团队、
 * 且当前选中的团队不在列表里（首次登录、或已被移出该团队）时跳到这里。
 *
 * 数据直接用 react-query 的 `['tenants']` 键，与 `useTenantRouting` 共用同一份缓存：
 * 从 /app 跳过来时列表已经在缓存里，不会闪一下 loading。
 *
 * 切换后只改 store 里的 `currentTenantId`，不带 token：租户不进 access token，
 * 而是每个请求带 `X-Tenant-Id`（见 shared/contracts/tenant.ts 的说明）。
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Spin } from 'antd';
import { CheckOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { AuthCard } from '@/components/auth/AuthCard';
import { useLogout } from '@/hooks/useLogout';
import { listTenants } from '@/shared/api/tenants';
import { useTenantStore } from '@/stores/tenant';
import { ROLE_LABEL, SELECT_TENANT_COPY } from './constants';

export const SelectTenant = () => {
  const navigate = useNavigate();
  const logout = useLogout();

  const currentTenantId = useTenantStore((s) => s.currentTenantId);
  const setCurrent = useTenantStore((s) => s.setCurrent);
  const setTenants = useTenantStore((s) => s.setTenants);

  const { data, isLoading } = useQuery({ queryKey: ['tenants'], queryFn: listTenants });

  useEffect(() => {
    if (data) setTenants(data.items);
  }, [data, setTenants]);

  const items = data?.items ?? [];

  const enter = (id: string) => {
    setCurrent(id);
    navigate('/app', { replace: true });
  };

  return (
    <AuthCard>
      <div className="mt-6 text-center">
        <div className="text-base leading-6 font-semibold text-ink">{SELECT_TENANT_COPY.title}</div>
        <div className="mt-1 text-xs leading-[18px] text-ink-3">{SELECT_TENANT_COPY.desc}</div>
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

        {/* 空列表是合法状态（成员被移出所有团队），不是错误，所以给空态而不是报错 */}
        {!isLoading && items.length === 0 && (
          <div className="rounded-md border border-solid border-split px-3 py-6 text-center">
            <div className="text-sm leading-[22px] text-ink">{SELECT_TENANT_COPY.empty}</div>
            <div className="mt-1 text-xs leading-[18px] text-ink-3">
              {SELECT_TENANT_COPY.emptyHint}
            </div>
          </div>
        )}

        {items.map((tenant) => {
          const active = tenant.id === currentTenantId;
          return (
            <button
              key={tenant.id}
              type="button"
              onClick={() => enter(tenant.id)}
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
