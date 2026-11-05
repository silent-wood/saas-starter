import { SetMetadata } from '@nestjs/common';
import { AuditAction } from '@saas/shared';

/**
 * 审计元数据键。interceptor 读的是同一个常量 ——
 * 两处各写一份字符串 'audit' 迟早会漂移，且漂移后不报错、只是静默不记审计。
 */
export const AUDIT_KEY = 'audit';

/**
 * 标记「该接口需要留痕」，参数取自 shared 的 AuditAction 词表（受类型约束，写错即编译失败）。
 *
 * 它只负责打元数据，不做校验也不拦截请求 —— 真正的写库在 AuditInterceptor 里。
 * 因为是纯 SetMetadata 组合，不需要 @Injectable()，也不进任何 Module 的 providers。
 *
 * 用法：
 *   @Audit('member.remove')
 *   @Delete(':id') remove() {...}
 *
 * ⚠️ 只能标在「已登录 + 有租户上下文」的接口上：
 *    actorUserId 取自 req.user.sub，取不到就直接跳过（interceptor 分支二，只 warn 不报错）。
 *    登录这类账号级审计没有可挂的接口，等 05 的登录流程补上后再启用。
 */
export const Audit = (action: AuditAction) => SetMetadata(AUDIT_KEY, action);
