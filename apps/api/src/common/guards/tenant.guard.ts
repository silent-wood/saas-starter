import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { PRISMA } from '../../prisma/prisma.module.ts';
import type { ExtendedPrismaClient } from '../../prisma/prisma.service.ts';
import { AuthenticatedRequest } from '../types/authenticated-request.ts';
import { ERROR_CODES } from '@saas/shared';

/**
 * 租户守卫：校验请求方是否有权访问 X-Tenant-Id 指定的租户。
 *
 * 执行时机：全局 JwtAuthGuard 通过之后（JwtAuthGuard 负责"你是谁"，
 * TenantGuard 负责"你在这个租户里有没有资格"）。两个守卫都注册为 APP_GUARD，
 * 且 JwtAuthGuard 在数组里排在 TenantGuard 之前（先确定 req.user.sub，本守卫才能查 membership）。
 *
 * 只做一件事：查 membership（userId + tenantId + status=active），
 * 存在则把 role 挂到 req.userRole，供后续 RBAC（Step 8.3 的 RolesGuard）使用；
 * 不存在或缺少 X-Tenant-Id 头，一律 403 TENANT_MISMATCH。
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(@Inject(PRISMA) private readonly prisma: ExtendedPrismaClient) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest & { userRole?: string }>();
    // 1) 拿租户 id：只信 X-Tenant-Id 头，不信任任何 body/query 里的 tenantId（业务纪律）
    const tenantId = req.headers['x-tenant-id'];
    if (!tenantId || typeof tenantId !== 'string') {
      throw new ForbiddenException({
        code: ERROR_CODES.TENANT_MISMATCH,
        message: '缺少租户上下文',
      });
    }
    // 2) 查 membership。注意：Membership 不在租户扩展白名单里（见 tenant.extension.ts），
    //    所以这里的查询【不会】被扩展自动加 tenantId，是干净的全量查询
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId: req.user.sub, // 当前用户（JwtAuthGuard 已写入 req.user）
        tenantId,
        status: 'active', // 只有 active 的成员关系才算"有权访问"
      },
      select: { role: true },
    });

    if (!membership) {
      throw new ForbiddenException({
        code: ERROR_CODES.TENANT_MISMATCH,
        message: '无权访问该租户',
      });
    }
    // 3) 把 role 挂到请求上，供 Controller 或后续 RolesGuard 使用
    req.userRole = membership.role;
    return true;
  }
}
