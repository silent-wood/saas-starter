// 必须用命名空间导入（`import * as z`）而不是默认导入：
// 生成的 .d.ts 里 zod 内部类型会写成 `z.z.core.$strip` 这类限定名，
// 默认导入在消费方（尤其 `moduleResolution: bundler`）拿不到 `z` 成员，
// 会让 `z.infer` 整体退化成 any，且被 skipLibCheck 静默吞掉。
import * as z from 'zod';
import { MEMBER_STATUS, ROLE } from '../roles.js';
import { tenantListItemSchema } from './tenant.js';

// ─────────────────────────────────────────────────────────────
// 成员列表
// ─────────────────────────────────────────────────────────────

/**
 * 成员行，取自 `memberships` + `users`。
 *
 * `status` 只允许 active / disabled：`removed` 是「已移出」，
 * 保留行只为留痕，出现在列表里就是幽灵成员（05 方案 AC-12）。
 *
 * `isSelf` 由后端算好下发，前端不要自己拿 userId 去比 —— 前端不知道当前 userId
 * （access token 里只有 sub，未落到 store），比较必然写错。
 */
export const memberItemSchema = z.object({
  /** `memberships.id`：改角色 / 禁用 / 移除 / 转让都用它做路径参数 */
  id: z.string(),
  /** `memberships.user_id`，仅用于展示与调试 */
  userId: z.string(),
  /** `users.nickname` */
  nickname: z.string(),
  /** `users.email`，注册时已归一化为小写 */
  email: z.string(),
  /** `users.avatar_url`，未设置时为 null */
  avatarUrl: z.string().nullable(),
  /** 该成员在本租户内的角色 */
  role: z.enum([ROLE.owner, ROLE.admin, ROLE.member]),
  /** active = 正常；disabled = 被停用（仍占席位，可恢复） */
  status: z.enum([MEMBER_STATUS.active, MEMBER_STATUS.disabled]),
  /** `memberships.joined_at`，ISO 8601 */
  joinedAt: z.string(),
  /** 是否是当前登录用户自己（自己那一行的操作项要禁用） */
  isSelf: z.boolean(),
});

export type MemberItem = z.infer<typeof memberItemSchema>;

/**
 * 待接受的邀请行。
 *
 * `expired` 是**现算**的派生字段而不是状态机的一档：过期不清库、不发任务，
 * 只看 `expiresAt` 与当前时间。否则需要一个定时任务把 pending 刷成 expired，
 * 而任务本身又得处理「刷之前用户刚好点了链接」的竞态。
 */
export const inviteItemSchema = z.object({
  /** `invites.id`：重发 / 撤销用 */
  id: z.string(),
  /** 被邀请的邮箱（小写归一化后） */
  email: z.string(),
  /** 接受后获得的角色，只可能是 admin / member */
  role: z.enum([ROLE.admin, ROLE.member]),
  /** 已过有效期（`expiresAt < now()`），前端置灰并提示重发 */
  expired: z.boolean(),
  /** 有效期截止时间，ISO 8601；固定为创建/重发时刻 + 7 天 */
  expiresAt: z.string(),
  /** 邀请人昵称（`users.nickname`），邀请人被删号时回落邮箱 */
  invitedByName: z.string(),
  /** 创建时间，ISO 8601 */
  createdAt: z.string(),
});

export type InviteItem = z.infer<typeof inviteItemSchema>;

/**
 * `GET /members` 成功响应（200）。
 *
 * 两块数据一次取回而不是两个接口：成员页同一屏要渲染「成员」与「待接受」两张表，
 * 分成两次请求会有一条先到一条后到，页面要处理局部 loading；而两者的过滤条件
 * 是同一个租户，没有独立分页的必要（团队规模上限在 M4 才引入配额）。
 */
export const memberListResultSchema = z.object({
  members: z.array(memberItemSchema),
  invites: z.array(inviteItemSchema),
});

export type MemberListResult = z.infer<typeof memberListResultSchema>;

// ─────────────────────────────────────────────────────────────
// 邀请
// ─────────────────────────────────────────────────────────────

/**
 * 创建邀请入参，用于 `POST /invites`。
 *
 * `role` 里**没有 owner**：owner 是 `tenants.owner_id` 上的唯一指称，
 * 通过邀请造出第二个 owner 会让转让接口的前提（唯一 owner）失效。
 * 换 owner 走 `POST /members/:id/transfer-owner`。
 */
export const createInviteInputSchema = z.object({
  email: z.string().min(1, '请输入邮箱').email('邮箱格式不正确'),
  role: z.enum([ROLE.admin, ROLE.member], { error: '请选择成员角色' }),
});

export type CreateInviteInput = z.infer<typeof createInviteInputSchema>;

/**
 * `POST /invites` 与 `POST /invites/:id/resend` 的成功响应。
 *
 * `joinUrl` 是**唯一一次**能看到明文 token 的地方：库中只存 sha256，
 * 丢了就只能重发（轮换出新 token，旧链接立即失效）。
 * 前端必须把它展示出来供复制 —— 邮件发不出去时这是唯一的送达手段（AC-17）。
 */
export const createInviteResultSchema = inviteItemSchema.extend({
  joinUrl: z.string(),
});

export type CreateInviteResult = z.infer<typeof createInviteResultSchema>;

/**
 * 邀请预览，用于 `GET /invites/:token`（`/join` 页在点「加入」之前展示）。
 *
 * 需登录：匿名可查等于把 token 枚举的成本降到零，而这个页面也不存在
 * 「未登录也能确定地加入」的形态 —— 必须先有账号（AC-06）。
 */
export const invitePreviewSchema = z.object({
  /** 邀请方团队名，页面主文案「XX 邀请你加入」 */
  tenantName: z.string(),
  /** 接受后获得的角色 */
  role: z.enum([ROLE.admin, ROLE.member]),
  /** 邀请人昵称 */
  inviterName: z.string(),
  /** 邀请目标邮箱，页面上展示「发给 xxx」，前端据此提示账号是否匹配 */
  email: z.string(),
  /** 已过期（仍可拿到预览，只是不能接受） */
  expired: z.boolean(),
  /** 已被接受过（重复点链接的场景，前端提示「你已在该团队中」） */
  accepted: z.boolean(),
});

export type InvitePreview = z.infer<typeof invitePreviewSchema>;

/**
 * 接受邀请入参，用于 `POST /invites/accept`。
 *
 * token 放 body 而不是路径：路径会进 access log 与审计 `detail.path`
 * （06 方案 AC-11 明令禁止明文令牌落库），body 不进审计。
 */
export const acceptInviteInputSchema = z.object({
  token: z.string().min(20, '邀请链接无效').max(64, '邀请链接无效'),
});

export type AcceptInviteInput = z.infer<typeof acceptInviteInputSchema>;

/**
 * `POST /invites/accept` 成功响应（200）：直接返回加入后的租户列表项。
 *
 * 复用 `TenantListItem`：前端拿到就能原地 append 进 `['tenants']` 缓存并
 * `switchTenant(id)`，不需要再拉一次 `GET /tenants`（与 `POST /tenants` 同款约定）。
 */
export const acceptInviteResultSchema = tenantListItemSchema;

export type AcceptInviteResult = z.infer<typeof acceptInviteResultSchema>;

// ─────────────────────────────────────────────────────────────
// 成员操作
// ─────────────────────────────────────────────────────────────

/**
 * 修改成员角色入参，用于 `PATCH /members/:id`。
 *
 * 同样不含 owner（见 `createInviteInputSchema` 的说明）。对象级规则
 * （admin 不能改 admin / owner、不能改自己）不在这里表达 —— 那是需要读目标
 * 当前角色的业务校验，schema 只有入参，判不了解（05 方案 §4.3）。
 */
export const updateMemberRoleInputSchema = z.object({
  role: z.enum([ROLE.admin, ROLE.member], { error: '请选择成员角色' }),
});

export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleInputSchema>;
