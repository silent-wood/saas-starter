/**
 * 租户角色，与 Prisma `MemberRole` 枚举逐项对应（apps/api/prisma/schema.prisma）。
 *
 * - `owner`：租户所有者。可删除 / 恢复租户、转让所有权，一人一租户仅一条记录
 * - `admin`：管理员。可管理成员与租户配置，不能删除租户
 * - `member`：普通成员。仅业务数据读写
 *
 * 当前阶段只用于列表展示与粗粒度判断，按钮级权限校验在 `06-RBAC 与按钮级权限` 落地。
 */
export const ROLE = {
  owner: 'owner',
  admin: 'admin',
  member: 'member',
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];

/**
 * 成员关系状态，与 Prisma `MemberStatus` 枚举逐项对应。
 *
 * - `active`：正常成员，可访问该租户
 * - `disabled`：被管理员停用，仍占着成员位、可恢复（区别于 removed）
 * - `removed`：已移出租户，重新加入会新建一条记录
 *
 * `GET /tenants` 只返回 `active` 的租户，其余状态不进列表。
 */
export const MEMBER_STATUS = {
  active: 'active',
  disabled: 'disabled',
  removed: 'removed',
} as const;

export type MemberStatus = (typeof MEMBER_STATUS)[keyof typeof MEMBER_STATUS];
