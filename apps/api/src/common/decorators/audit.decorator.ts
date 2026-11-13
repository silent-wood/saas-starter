import { SetMetadata } from '@nestjs/common';
import { AuditAction } from '@saas/shared';

/**
 * 审计元数据键。interceptor 读的是同一个常量 ——
 * 两处各写一份字符串 'audit' 迟早会漂移，且漂移后不报错、只是静默不记审计。
 */
export const AUDIT_KEY = 'audit';

/**
 * 审计对象的类型。**刻意不放进 shared**：它只有拦截器用，前端拿到也无从消费，
 * 放进契约包只会多一个没人用的联合类型。
 */
export type AuditObjectType = 'member' | 'resource' | 'invite';

export interface AuditMeta {
  /** 必填：拦截器靠它决定记什么动作，缺了就是「有记录没动作」，Prisma 会直接拒写 */
  action: AuditAction;
  /** 对象类型，取值与 action 的域同源（member / resource / invite） */
  objectType?: AuditObjectType;
  /**
   * 失败分支从 req.params 取 objectId 的键名。**必须显式声明**，不声明就不取：
   * `invites/:token` 的路径参数是可直接兑换入团的明文令牌，默认「params 里有 id 就记」
   * 等于把它写进 audit_logs 留存 180 天（AC-26）。
   */
  objectIdParam?: string;
}

/**
 * 标记「该接口需要留痕」。
 *
 * 用法：
 *   @Audit(AUDIT_ACTIONS.MEMBER_REMOVE, { objectType: 'member', objectIdParam: 'id' })
 *   @Delete(':id') remove() {...}
 *
 * 它只负责打元数据，不做校验也不拦截请求 —— 真正的写库在 AuditInterceptor 里。
 * 因为是纯 SetMetadata 组合，不需要 @Injectable()，也不进任何 Module 的 providers。
 *
 * ⚠️ 只能标在「已登录 + 有租户上下文」的接口上：actorUserId 取自 req.user.sub，
 *    取不到就直接跳过（interceptor 分支二，只 warn 不报错）。登录这类账号级事件
 *    不走 @Audit —— 它挂在 @Public 接口上，没有 req.user，由 AuthService 直接调
 *    audit.record({ tenantId: null }) 写入。
 *
 * ⚠️ 第二参数的 `objectType` 只影响「对象列」的显示，写错不会让接口出错；
 *    但 `objectIdParam` 写错会让失败记录丢掉 objectId，所以类型上只能靠命名约定。
 */
export const Audit = (action: AuditAction, meta: Omit<AuditMeta, 'action'> = {}) =>
  SetMetadata(AUDIT_KEY, { action, ...meta } satisfies AuditMeta);
