import { Controller, Get, Inject } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
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
  @Public()
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
