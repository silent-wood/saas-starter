// ─────────────────────────────────────────────────────────────
// RBAC 权限矩阵：后端 @Roles 与前端 usePermission 的唯一来源
// 纪律：矩阵只表达「哪个角色能进这个功能」；「admin 不能改 owner」
// 这类对象级规则属于成员管理的业务校验，不进矩阵（见 06 方案 §4.3）

import type { Role } from './roles.js';

// ─────────────────────────────────────────────────────────────
export const PERMISSIONS = {
  'resource.read': ['member', 'admin', 'owner'],
  'resource.write': ['member', 'admin', 'owner'],
  'file.upload': ['member', 'admin', 'owner'],
  'trash.manage': ['admin', 'owner'],
  'audit.view': ['admin', 'owner'],
  'member.invite': ['admin', 'owner'],
  'member.role_change': ['admin', 'owner'],
  'member.disable': ['admin', 'owner'],
  'member.remove': ['admin', 'owner'],
  'member.transfer_owner': ['owner'], // 转让仅 owner
  'billing.view': ['owner'],
  'billing.subscribe': ['owner'],
  'billing.refund': ['owner'],
  'tenant.update': ['admin', 'owner'],
} as const;

export type Permission = keyof typeof PERMISSIONS;

/** 前端 usePermission().can(...) 与后端 @Roles 判定的同一个函数 */
export function canDo(role: Role, permission: Permission): boolean {
  // 断言 readonly Role[]：as const 推出的元组类型不能直接 includes(Role)
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}
