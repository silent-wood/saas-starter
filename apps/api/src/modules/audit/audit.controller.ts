import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service.ts';
import { Roles } from '../../common/decorators/roles.decorator.ts';
import { type AuditLogListResult, type AuditLogQuery, auditLogQuerySchema } from '@saas/shared';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Roles('owner', 'admin')
  list(@Query({ schema: auditLogQuerySchema }) query: AuditLogQuery): Promise<AuditLogListResult> {
    // query 已被 zod 管道 parse 过，page/pageSize 一定有值（schema 的 default 生效），
    // 所以这里不需要再写 ?? 1 / ?? 20
    return this.audit.list(query);
  }
}
