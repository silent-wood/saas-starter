import { ForbiddenException } from '@nestjs/common';
import { ERROR_CODES } from '@saas/shared';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.ts';
import type { Actor } from './members.service.ts';

/**
 * 从请求里取操作人（userId + 本租户角色）。
 *
 * `userRole` 由 `TenantGuard` 写入，`@SkipTenant` 的接口没有它 —— 那些接口
 * （接受/预览邀请）不经过这里。拿不到角色说明接口装配错了（比如误标 @SkipTenant
 * 又想用对象级规则），此时 fail-closed 比默认放行安全。
 */
export function actorFrom(req: AuthenticatedRequest): Actor {
  const role = req.userRole;
  if (!role) {
    throw new ForbiddenException({
      code: ERROR_CODES.ROLE_DENIED,
      message: '当前角色无权执行该操作',
    });
  }
  return { userId: req.user.sub, role };
}
