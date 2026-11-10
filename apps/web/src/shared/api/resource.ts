/**
 * 资源 / 回收站接口薄封装（07 方案 §3.2）
 *
 * 类型全部来自 `@saas/shared` 的 resource 契约，本文件不重复定义任何字段。
 * 错误由 client.ts 拦截器归一为 ApiError 后抛出，调用方按 `code` 分支处理
 * （注意 VALIDATION_FAILED 是 422，但分支依据是 code 不是状态码）。
 */
import type {
  ResourceCreateInput,
  ResourceItem,
  ResourceListResult,
  ResourceQuery,
  ResourceUpdateInput,
  TrashListResult,
} from '@saas/shared';
import { api } from './client';

export const resourceApi = {
  /** GET /resources 分页列表，支持 q / category 过滤 */
  list: (params: Partial<ResourceQuery>) => api.get<ResourceListResult>('/resources', { params }),
  /** GET /resources/:id 详情；软删记录后端按 404 RESOURCE_NOT_FOUND 返回 */
  detail: (id: string) => api.get<ResourceItem>(`/resources/${id}`),
  /** POST /resources 新建；tenantId / createdBy 由后端注入，请求体不含 */
  create: (data: ResourceCreateInput) => api.post<ResourceItem>('/resources', data),
  /** PATCH /resources/:id 更新，允许空对象（幂等空更新） */
  update: (id: string, data: ResourceUpdateInput) =>
    api.patch<ResourceItem>(`/resources/${id}`, data),
  /** DELETE /resources/:id 软删除（移入回收站） */
  remove: (id: string) => api.delete<ResourceItem>(`/resources/${id}`),
  /** GET /trash 回收站列表，只含 30 天窗口内的记录 */
  trashList: (params: Partial<ResourceQuery>) => api.get<TrashListResult>('/trash', { params }),
  /** POST /trash/:id/restore 恢复；超 30 天窗口返回 404 RESOURCE_NOT_FOUND */
  restore: (id: string) => api.post<ResourceItem>(`/trash/${id}/restore`),
  /** DELETE /trash/:id 彻底删除（物理删除，不可恢复） */
  purge: (id: string) => api.delete<ResourceItem>(`/trash/${id}`),
};
