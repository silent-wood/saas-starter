import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ExtendedPrismaClient } from '../../prisma/prisma.service.ts';
import { PRISMA } from '../../prisma/prisma.module.ts';

/**
 * 各类数据的保留期（天），与《数据库设计与数据字典》及 08 方案 AC-03~07 同源。
 * 改口径只改这里，where 条件全部由 run() 派生。
 */
export const RETENTION_DAYS = {
  /** 回收站窗口，07 方案既定的 30 天 */
  trash: 30,
  /** 过期邮件令牌的额外宽限期：过期后仍留 7 天供排查，随后清除（含已消费行） */
  emailToken: 7,
  /** 会话令牌（按过期或吊销时间起算） */
  refreshToken: 30,
  /** 审计日志 */
  auditLog: 180,
} as const;

export interface CleanupResult {
  resources: number;
  emailTokens: number;
  refreshTokens: number;
  auditLogs: number;
}

/**
 * 到期数据清理（08 方案）：回收站过期资源、过期邮件令牌、过期/吊销会话、过期审计。
 *
 * 运行环境是 BullMQ Worker —— **没有租户上下文**。这是预期行为而非疏漏：
 * applyTenantScope 在 getStore() 为空时对白名单模型原样放行，本服务的 where
 * 刻意不带 tenantId，清的是全平台过期行（08 方案 AC-09）。
 * 禁止在 Worker 回调里用 tenantContext.run() 伪造上下文。
 */
@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(@Inject(PRISMA) private readonly prisma: ExtendedPrismaClient) {}

  async run(): Promise<CleanupResult> {
    const now = Date.now();
    const cutoff = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000);

    // 各表一次 deleteMany，天然幂等：job 重试重复执行不会多删（08 方案 §2.3）
    const resources = await this.prisma.resource.deleteMany({
      where: { deletedAt: { lt: cutoff(RETENTION_DAYS.trash) } },
    });
    const emailTokens = await this.prisma.emailToken.deleteMany({
      where: { expiresAt: { lt: cutoff(RETENTION_DAYS.emailToken) } },
    });
    const refreshTokens = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: cutoff(RETENTION_DAYS.refreshToken) } },
          { revokedAt: { lt: cutoff(RETENTION_DAYS.refreshToken) } },
        ],
      },
    });
    const auditLogs = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff(RETENTION_DAYS.auditLog) } },
    });

    const result: CleanupResult = {
      resources: resources.count,
      emailTokens: emailTokens.count,
      refreshTokens: refreshTokens.count,
      auditLogs: auditLogs.count,
    };
    // 自动清理无操作者、不写 audit_logs（AC-08），留痕靠这条计数日志
    this.logger.log(
      `到期数据清理完成：resources=${result.resources} emailTokens=${result.emailTokens} ` +
        `refreshTokens=${result.refreshTokens} auditLogs=${result.auditLogs}`,
    );
    return result;
  }
}
