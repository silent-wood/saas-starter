/**
 * 审计日志接口薄封装（06 方案 F-19）
 *
 * 类型全部来自 `@saas/shared` 的 audit 契约，本文件不重复定义字段。
 *
 * ⚠️ **不要**把 `/audit-logs` 加进 client.ts 的 TENANT_FREE 列表：
 * 审计必须带 `X-Tenant-Id`，后端靠租户上下文取 tenantId（取不到直接 403）。
 * 加进去等于告诉 axios「这个接口不需要租户头」，请求会稳定失败。
 */
import type { AuditLogListResult, AuditLogQuery } from '@saas/shared';
import { api } from './client';

export const auditApi = {
  /**
   * GET /audit-logs 分页查询。
   *
   * 入参用 `Partial<AuditLogQuery>` 而不是完整类型：page / pageSize 有 schema default，
   * 前端不传也能查；其余筛选项不传即「不限」（axios 会把 undefined 的键丢掉）。
   * 但**不能传空串** —— `from` / `to` 走 z.iso.datetime，空串会被后端判 422。
   */
  list: (params: Partial<AuditLogQuery>) => api.get<AuditLogListResult>('/audit-logs', { params }),
};
