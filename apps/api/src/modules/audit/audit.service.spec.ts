import { Logger } from '@nestjs/common';
import { describe, beforeEach, afterEach, it, expect, vi, type Mock } from 'vitest';
import type { ExtendedPrismaClient } from '../../prisma/prisma.service.ts';
import { AuditService, type AuditRecord } from './audit.service.ts';

/**
 * AuditService 单测。
 *
 * 主目标是锁住「永不抛」这条契约：写库失败时 record() 必须正常 resolve。
 * 一旦破坏，拦截器里 `void record(...)` 会变成 unhandled rejection，
 * 严重时直接终止 Node 进程 —— 审计故障升级成全站故障。
 *
 * 用 mock 而非真库：真库正常时走不到 catch 分支，测不出这条契约；
 * 且要断言「异常被吞掉」只能让 create 明确 reject。
 */
describe('AuditService', () => {
  let create: Mock;
  let service: AuditService;

  const entry: AuditRecord = {
    tenantId: 't1',
    actorUserId: 'u1',
    action: 'member.remove',
    result: 'success',
    detail: { method: 'DELETE', path: '/members/m1', durationMs: 12 },
  };

  beforeEach(() => {
    create = vi.fn().mockResolvedValue({});
    service = new AuditService({ auditLog: { create } } as unknown as ExtendedPrismaClient);
    // 失败用例会打 error 日志，静音避免污染测试输出
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('正常写入：把 entry 原样交给 auditLog.create', async () => {
    await service.record(entry);
    expect(create).toHaveBeenCalledWith({ data: entry });
  });

  it('写库失败 → 吞掉异常，不向调用方抛（审计不能带崩主请求）', async () => {
    create.mockRejectedValue(new Error('pg down'));
    await expect(service.record(entry)).resolves.toBeUndefined();
    expect(Logger.prototype.error).toHaveBeenCalled();
  });
});
