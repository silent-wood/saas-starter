import { Controller, Get, Inject } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { SkipTenant } from '../../common/decorators/skip-tenant.decorator.ts';
import { PRISMA } from '../../prisma/prisma.module.ts';
import type { ExtendedPrismaClient } from '../../prisma/prisma.service.ts';
export interface HealthPayload {
  status: string;
  uptime: number;
  timestamp: string;
}

@Controller('health')
export class HealthController {
  // 注入带租户隔离扩展的 client。健康检查用 $queryRaw 探测数据库连通性，
  // 与业务读写走同一个连接池。token 是 Symbol，必须显式 @Inject
  constructor(@Inject(PRISMA) private readonly prisma: ExtendedPrismaClient) {}

  // @Public 只跳过 JwtAuthGuard；TenantGuard 是另一个全局守卫，
  // 它要求 X-Tenant-Id 头，探活请求不带 → 会 403。
  // 健康检查属于基础设施接口，永远不该要求租户上下文，所以两个守卫都要跳过。
  @Public()
  @SkipTenant()
  @Get()
  check(): HealthPayload {
    // 只返回 data —— 统一响应包装由步骤 4 的 TransformInterceptor 完成。
    // Controller 不要自己拼 { success, data, message, timestamp }，否则会被包两层。
    return {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @SkipTenant()
  @Get('db')
  async checkDb() {
    const start = Date.now();
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      latencyMs: Date.now() - start,
    };
  }
}
