import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CleanupService, type CleanupResult } from './cleanup.service.ts';
import type { ExtendedPrismaClient } from '../../prisma/prisma.service.ts';

/** 固定「当前时刻」，让 4 个 cutoff 的期望值可以精确断言 */
const FIXED_NOW = new Date('2026-11-13T03:00:00+08:00').getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

function buildPrisma() {
  return {
    resource: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
    emailToken: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
    refreshToken: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    // create 与 deleteMany 并列 mock：AC-08 断言清理过程不写审计
    auditLog: { deleteMany: vi.fn().mockResolvedValue({ count: 4 }), create: vi.fn() },
  };
}

type MockPrisma = ReturnType<typeof buildPrisma>;

function buildService(mock: MockPrisma) {
  return new CleanupService(mock as unknown as ExtendedPrismaClient);
}

describe('CleanupService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_NOW));
  });

  it('四张表按各自保留期清理，where 不含 tenantId（AC-03~07、09）', async () => {
    const prisma = buildPrisma();
    await buildService(prisma).run();

    // resources：deleted_at < now - 30d（AC-03/04）
    expect(prisma.resource.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { deletedAt: { lt: new Date(FIXED_NOW - 30 * DAY_MS) } },
    });
    // email_tokens：expires_at < now - 7d，已消费行同样命中（AC-05）
    expect(prisma.emailToken.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { expiresAt: { lt: new Date(FIXED_NOW - 7 * DAY_MS) } },
    });
    // refresh_tokens：过期或吊销满 30 天（AC-06）
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: {
        OR: [
          { expiresAt: { lt: new Date(FIXED_NOW - 30 * DAY_MS) } },
          { revokedAt: { lt: new Date(FIXED_NOW - 30 * DAY_MS) } },
        ],
      },
    });
    // audit_logs：created_at < now - 180d（AC-07）
    expect(prisma.auditLog.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { createdAt: { lt: new Date(FIXED_NOW - 180 * DAY_MS) } },
    });

    // AC-09：清理刻意跨租户，每个 where 顶层不得出现 tenantId
    for (const model of ['resource', 'emailToken', 'refreshToken', 'auditLog'] as const) {
      const args = prisma[model].deleteMany.mock.calls[0][0] as { where: object };
      expect(args.where).not.toHaveProperty('tenantId');
    }
  });

  it('返回各表删除计数汇总（AC-03）', async () => {
    const prisma = buildPrisma();
    const result: CleanupResult = await buildService(prisma).run();
    expect(result).toEqual({ resources: 2, emailTokens: 3, refreshTokens: 1, auditLogs: 4 });
  });

  it('清理过程不写 audit_logs（AC-08）', async () => {
    const prisma = buildPrisma();
    await buildService(prisma).run();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('单表删除失败时异常上抛（AC-11 的重试语义前提）', async () => {
    const prisma = buildPrisma();
    prisma.resource.deleteMany.mockRejectedValue(new Error('db down'));
    await expect(buildService(prisma).run()).rejects.toThrow('db down');
    // 失败后不再继续清理后续表
    expect(prisma.emailToken.deleteMany).not.toHaveBeenCalled();
  });
});
