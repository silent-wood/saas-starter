/**
 * 成员与邀请接口薄封装（05 方案 §3.2）
 *
 * 类型全部来自 `@saas/shared` 的 member 契约，本文件不重复定义字段。
 * 错误由 client.ts 归一为 ApiError 后抛出，调用方按 `code` 分支
 * （`MEMBER_STATE_INVALID` / `OWNER_TRANSFER_INVALID` / `TOKEN_INVALID`）。
 */
import type {
  AcceptInviteInput,
  AcceptInviteResult,
  CreateInviteInput,
  CreateInviteResult,
  InvitePreview,
  MemberItem,
  MemberListResult,
  UpdateMemberRoleInput,
} from '@saas/shared';
import { api } from './client';

export const memberApi = {
  /** GET /members 成员 + 待接受邀请，一次取回（member 也可读） */
  list: () => api.get<MemberListResult>('/members'),

  /** PATCH /members/:id 改角色（admin 只能改 member，服务端判） */
  updateRole: (id: string, data: UpdateMemberRoleInput) =>
    api.patch<MemberItem>(`/members/${id}`, data),
  /** POST /members/:id/disable 禁用：可逆，仍占席位 */
  disable: (id: string) => api.post<MemberItem>(`/members/${id}/disable`),
  /** POST /members/:id/enable 启用 */
  enable: (id: string) => api.post<MemberItem>(`/members/${id}/enable`),
  /** DELETE /members/:id 移除：只改状态，再次邀请会复用同一行 */
  remove: (id: string) => api.delete<{ id: string }>(`/members/${id}`),
  /** POST /members/:id/transfer-owner 转让所有权（仅 owner） */
  transferOwner: (id: string) =>
    api.post<{ tenantId: string; ownerId: string }>(`/members/${id}/transfer-owner`),

  /** POST /invites 创建邀请，响应里的 joinUrl 是明文 token 的唯一出处 */
  invite: (data: CreateInviteInput) => api.post<CreateInviteResult>('/invites', data),
  /** POST /invites/:id/resend 重发：轮换 token，旧链接立即失效 */
  resendInvite: (id: string) => api.post<CreateInviteResult>(`/invites/${id}/resend`),
  /** DELETE /invites/:id 撤销 */
  revokeInvite: (id: string) => api.delete<{ id: string }>(`/invites/${id}`),

  /** GET /invites/:token 加入页预览（需登录） */
  previewInvite: (token: string) => api.get<InvitePreview>(`/invites/${token}`),
  /** POST /invites/accept 接受邀请，返回可直接塞进租户列表的 TenantListItem */
  acceptInvite: (data: AcceptInviteInput) => api.post<AcceptInviteResult>('/invites/accept', data),
};
