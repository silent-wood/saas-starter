import * as z from 'zod';
import { AUDIT_ACTIONS } from '../audit-actions.js';
import { ROLE } from '../roles.js';

/**
 * 审计列表查询，用于 `GET /audit-logs`。
 *
 * query string 的值全是字符串，数值参数必须 `z.coerce.number()`；`default()` 让
 * controller 不必再写 `?? 1`。
 *
 * `from` / `to` 用 `z.iso.datetime({ offset: true })`：同时接受 `…Z` 与 `…+08:00`。
 * **空串会被拒绝**（422），所以前端「没选时间」时要么不传、要么传合法 ISO，不能传 `''`。
 */
export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  actorUserId: z.string().optional(),
  action: z.enum(Object.values(AUDIT_ACTIONS), { error: '动作取值不合法' }).optional(),
  result: z.enum(['success', 'failed'], { error: '结果取值不合法' }).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

/**
 * 列表项。
 *
 * `detail`（jsonb）**摊平成 path / statusCode / durationMs 三个字段**而不是整块透传：
 * 它当前只有四个键，摊平后类型安全、前端不用写 `detail.path as string`；
 * 将来 `detail` 加键时同步加契约字段，编译期就能发现漏改。
 */
export const auditLogItemSchema = z.object({
  id: z.string(),
  action: z.string(),
  objectType: z.string().nullable(),
  objectId: z.string().nullable(),
  objectName: z.string().nullable(),
  actorUserId: z.string(),
  actorName: z.string().nullable(),
  actorEmail: z.string().nullable(),
  /**
   * 操作者**在执行该操作时**的角色，来自写入时的快照（`detail.actorRole`）。
   *
   * 与 actorName / actorEmail 的区别要看清：那两项是查询时 join `users` 得到的**当前值**，
   * 这一项是**当时值**。审计的用途是追责，角色必须锁定在操作发生的那一刻 ——
   * 用 `actorUserId` 现查 memberships 只会拿到「现在是什么」，当事人被降级后，
   * 三个月前那条「邀请成员」的记录会显示成「成员」，历史被改写成假的。
   *
   * null 的两种来源：
   *   1. 本期之前写入的历史记录没有这个键；
   *   2. `@SkipTenant` 的接口没有 req.userRole（当前所有带 @Audit 的接口都不是）。
   */
  actorRole: z.enum([ROLE.owner, ROLE.admin, ROLE.member]).nullable(),
  result: z.enum(['success', 'failed']),
  ip: z.string().nullable(),
  path: z.string().nullable(),
  statusCode: z.number().nullable(),
  durationMs: z.number().nullable(),
  createdAt: z.string(),
});

export type AuditLogItem = z.infer<typeof auditLogItemSchema>;

export const auditLogListResultSchema = z.object({
  items: z.array(auditLogItemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});

export type AuditLogListResult = z.infer<typeof auditLogListResultSchema>;
