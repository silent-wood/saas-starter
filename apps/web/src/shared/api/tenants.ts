import type { TenantListResult } from '@saas/shared';
import { api } from './client';

export const listTenants = () => api.get<TenantListResult>('/tenants');
