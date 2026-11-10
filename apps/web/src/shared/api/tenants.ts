import type { CreateTenantInput, CreateTenantResult, TenantListResult } from '@saas/shared';
import { api } from './client';

export const listTenants = () => api.get<TenantListResult>('/tenants');

/**
 * 创建团队（`POST /tenants`，创建者即 owner）。
 *
 * 返回的就是 `TenantListItem` 形状，可以直接追加进 `['tenants']` 的缓存，
 * 不用事后重拉一次列表 —— 建完立刻切过去时，下拉里已经有这一项了。
 *
 * 这个接口是 `@SkipTenant`：调用时目标团队还不存在，带 `X-Tenant-Id` 反而矛盾。
 */
export const createTenant = (input: CreateTenantInput) =>
  api.post<CreateTenantResult>('/tenants', input);
