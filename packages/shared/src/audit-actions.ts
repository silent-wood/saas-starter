/**
 * 审计动作常量。格式 `域.动作`，域的取值与 objectType 同源。
 * 禁止在 Controller 里写裸字符串 —— 否则前端筛选器的枚举值会与写入值漂移。
 */
export const AUDIT_ACTIONS = {
  AUTH_LOGIN: 'auth.login',
  MEMBER_INVITE: 'member.invite',
  MEMBER_ROLE_CHANGE: 'member.role_change',
  MEMBER_DISABLE: 'member.disable',
  MEMBER_ENABLE: 'member.enable',
  MEMBER_REMOVE: 'member.remove',
  MEMBER_TRANSFER_OWNER: 'member.transfer_owner',
  RESOURCE_CREATE: 'resource.create',
  RESOURCE_UPDATE: 'resource.update',
  RESOURCE_DELETE: 'resource.delete',
  RESOURCE_RESTORE: 'resource.restore',
  RESOURCE_PURGE: 'resource.purge',
  SUBSCRIPTION_SUBSCRIBE: 'subscription.subscribe',
  SUBSCRIPTION_CANCEL: 'subscription.cancel',
  SUBSCRIPTION_REFUND: 'subscription.refund',
  QUOTA_ADJUST: 'quota.adjust',
  TENANT_UPDATE: 'tenant.update',
} as const;

/**
 * 动作的中文名。
 *
 * 键**必须写字面量**，不要写成 `[AUDIT_ACTIONS.MEMBER_REMOVE]: '移除成员'`：
 * `as const` 对象里的计算属性键会退化成 `string`，`satisfies Record<AuditAction, string>`
 * 的穷尽性检查随之失效——将来 `AUDIT_ACTIONS` 加一条而这里漏加，编译器不会报错。
 */
export const AUDIT_ACTION_LABELS = {
  'auth.login': '登录',
  'member.invite': '邀请成员',
  'member.role_change': '修改成员角色',
  'member.disable': '禁用成员',
  'member.enable': '启用成员',
  'member.remove': '移除成员',
  'member.transfer_owner': '转让团队所有权',
  'resource.create': '创建资源',
  'resource.update': '更新资源',
  'resource.delete': '删除资源（移入回收站）',
  'resource.restore': '恢复资源',
  'resource.purge': '彻底删除资源',
  'subscription.subscribe': '订阅',
  'subscription.cancel': '取消订阅',
  'subscription.refund': '退款',
  'quota.adjust': '调整配额',
  'tenant.update': '更新团队信息',
} satisfies Record<AuditAction, string>;

/** 动作前缀（`域.动作` 的域）中文名，筛选下拉按域分组用；未知域由调用方显示原值 */
export const AUDIT_DOMAIN_LABELS: Record<string, string> = {
  auth: '登录与会话',
  member: '成员与邀请',
  resource: '资源',
  subscription: '订阅与支付',
  quota: '配额',
  tenant: '团队',
};

/** 审计对象的类型中文名（列表「对象」列在没有 objectName 时的降级显示） */
export const AUDIT_OBJECT_TYPE_LABELS: Record<string, string> = {
  member: '成员',
  resource: '资源',
  invite: '邀请',
};

/**
 * 动作码 → 中文名。未知动作原样返回：`audit_logs` 里存着历史动作，
 * 词表回退时不能让页面渲染出 `undefined`。
 */
export function auditActionLabel(action: string): string {
  return (AUDIT_ACTION_LABELS as Record<string, string>)[action] ?? action;
}

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
