import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { tenantContext } from '../../prisma/tenant.extension.ts';

/**
 * 租户上下文中间件。
 *
 * 职责：读请求头 X-Tenant-Id，若有值就用 tenantContext.run() 包住后续处理，
 * 让这条请求链上的所有 Prisma 操作都能 getStore() 拿到租户 id。
 *
 * 注意两点：
 *  1. 这里【只】建立上下文，不做权限校验。校验是 TenantGuard 的职责
 *     （Guard 在中间件之后、路由 handler 之前执行）。
 *  2. 没有 X-Tenant-Id 头时也要 next() 放行，不能在这里拒绝——
 *     因为 /auth/* 等公开接口和 /tenants 列表接口本来就不需要租户上下文。
 *     需要租户上下文的接口，由 TenantGuard 兜底拒绝（见文件 5）。
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const tenantId = req.headers['x-tenant-id'];
    if (typeof tenantId === 'string' && tenantId) {
      tenantContext.run({ tenantId }, () => next());
    } else {
      next();
    }
  }
}
