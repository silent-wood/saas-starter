// 必须用命名空间导入（`import * as z`）而不是默认导入：
// 生成的 .d.ts 里 zod 内部类型会写成 `z.z.core.$strip` 这类限定名，
// 默认导入在消费方（尤其 `moduleResolution: bundler`）拿不到 `z` 成员，
// 会让 `z.infer` 整体退化成 any，且被 skipLibCheck 静默吞掉。
import * as z from 'zod';
import { MEMBER_STATUS, ROLE } from '../roles.js';

/**
 * 租户列表项，用于 `GET /tenants`（独立接口，登录与 `/auth/me` 都不返回租户信息）。
 *
 * 之所以独立成接口：一个用户可属多个租户，把租户写进 access token 会导致
 * 切租户必须换令牌。现改为请求级传递——前端带 `X-Tenant-Id` 头，守卫校验
 * 该用户在此租户的 membership 存在且 `status=active`。
 */
export const tenantListItemSchema = z.object({
  /** `tenants.id`（cuid），切换租户时作为 `X-Tenant-Id` 的值 */
  id: z.string(),
  /** `tenants.name`，即注册时填的 `tenantName`；已软删租户不会出现在列表里 */
  name: z.string(),
  /** 当前用户在该租户内的角色，取自 `memberships.role` */
  role: z.enum([ROLE.owner, ROLE.admin, ROLE.member]),
  /** 成员关系状态，取自 `memberships.status`；列表只返回 `active`，其余状态用于后续成员管理页 */
  status: z.enum([MEMBER_STATUS.active, MEMBER_STATUS.disabled, MEMBER_STATUS.removed]),
  /** 最近一次与该租户的交互时间（`memberships.last_active_at`），ISO 8601；从未交互为 null */
  lastActiveAt: z.string().nullable(),
});

export type TenantListItem = z.infer<typeof tenantListItemSchema>;

/**
 * `GET /tenants` 成功响应（200）。需带 access token。
 *
 * 只返回 `memberships.status = active` 且租户未软删（`tenants.deleted_at` 为空）的记录，
 * 按 `lastActiveAt` 降序、空值排最后。列表为空是合法状态（理论上注册即建租户，
 * 但成员被移出后会出现空列表），前端需处理空态而不是当成错误。
 */
export const tenantListResultSchema = z.object({
  /** 按 `lastActiveAt` 降序排列；数组可能为空 */
  items: z.array(tenantListItemSchema),
});

export type TenantListResult = z.infer<typeof tenantListResultSchema>;
