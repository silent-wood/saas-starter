import { Inject, Injectable, Logger } from '@nestjs/common';
import { PRISMA } from '../../prisma/prisma.module.ts';
import type { ExtendedPrismaClient } from '../../prisma/prisma.service.ts';
import { AuditAction } from '@saas/shared';
import type { Prisma } from '../../generated/prisma/client.ts';

/**
 * 一条审计记录。字段与 AuditLog model 的可见列一一对应。
 *
 * 为什么单独定义而不直接用 Prisma 的 AuditLogCreateInput：
 *   让 interceptor 依赖 ORM 生成类型，会把「审计契约」和 Prisma 版本绑死；
 *   这里用窄接口，由 service 负责最后一步映射。
 */
export interface AuditRecord {
  /** null = 账号级事件（如登录），当前无此类写入 */
  tenantId?: string | null;
  actorUserId: string;
  action: AuditAction;
  objectType?: string | null;
  objectId?: string | null;
  /** PG 列是 INET，只接受合法 IPv4/IPv6；调用方必须把空串兜成 null */
  ip?: string | null;
  result: 'success' | 'failed';
  /** 脱敏上下文：禁止放请求体原文、Authorization、cookie、令牌 */
  detail?: Prisma.InputJsonObject;
}

/**
 * 审计写入服务。唯一职责：把一条 AuditRecord 落到 audit_logs，失败就吞掉。
 *
 * 注入的是带租户扩展的 PRISMA client，但 AuditLog **不在** TENANT_SCOPED 白名单里，
 * 扩展不会给它自动加 tenant_id —— 这是有意的：
 *   1. 审计要能记录「跨租户」和「账号级」事件，自动注入会把这两种场景写歪；
 *   2. 读审计（后续的审计页）要按 tenant_id 显式过滤，由查询方控制更安全。
 * 所以 tenantId 一律由调用方在 entry 里显式给出。
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Inject(PRISMA) private readonly prisma: ExtendedPrismaClient) {}

  /**
   * 写一条审计。**永不抛异常** —— 审计是旁路，不能把业务请求带崩。
   * 调用方用 `void` 不 await，主请求不等这次 INSERT（Neon 远程库约 5–20ms）。
   *
   * 这条「永不抛」是契约而非实现细节，audit.service.spec 专门锁了它：
   * 一旦这里开始抛，拦截器里的 void 调用会变成 unhandled rejection，
   * 在某些 Node 版本上直接终止进程。
   */
  async record(entry: AuditRecord): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: { ...entry } });
    } catch (err) {
      // 只打日志不重抛：审计库抖动不应导致业务 500
      this.logger.error(
        `审计写入失败 action=${entry.action}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
