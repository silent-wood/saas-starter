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

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
