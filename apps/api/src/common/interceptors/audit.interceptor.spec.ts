import { CallHandler, ExecutionContext, NotFoundException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';
import { describe, beforeEach, it, expect, vi, type Mock } from 'vitest';
import type { AuditService } from '../../modules/audit/audit.service.ts';
import { AuditInterceptor } from './audit.interceptor.ts';

/**
 * AuditInterceptor 单测。
 *
 * mock 范围：Reflector（喂 @Audit 的动作名）+ AuditService.record（只观察调用参数）。
 * 不连库 —— 这里验的是「什么情况下记、记哪些字段」，不是 SQL 能否跑通。
 *
 * 两个容易忽略但必须锁住的点：
 *   1. detail.path 必须来自 req.path；用 originalUrl 会把 ?token=SECRET 带进库（AC-11）；
 *   2. 异常要原样往上抛（rejects.toBe(boom)），拦截器只旁路记录、不改写错误类型。
 */
describe('AuditInterceptor', () => {
  let getAllAndOverride: Mock;
  let record: Mock;
  let interceptor: AuditInterceptor;

  beforeEach(() => {
    getAllAndOverride = vi.fn();
    record = vi.fn().mockResolvedValue(undefined);
    interceptor = new AuditInterceptor(
      { getAllAndOverride } as unknown as Reflector,
      {
        record,
      } as unknown as AuditService,
    );
  });

  /** originalUrl 刻意带上 ?token=SECRET，用来验证它不会被写进审计 */
  function createContext(overrides: Record<string, unknown> = {}) {
    const req = {
      method: 'DELETE',
      path: '/members/m1',
      originalUrl: '/members/m1?token=SECRET',
      ip: '1.2.3.4',
      user: { sub: 'u1' },
      // 真实请求里这个字段由 TenantGuard 写入（所有带 @Audit 的接口都是租户内的）
      userRole: 'admin',
      ...overrides,
    };
    return {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => () => undefined,
      getClass: () => class {},
    } as unknown as ExecutionContext;
  }

  const handler = (obs = of({ ok: true })) => ({ handle: () => obs }) as CallHandler;
  /** record 是 void 异步调用，等一轮宏任务让它落地 */
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('未标 @Audit → 完全不介入，不写审计', async () => {
    getAllAndOverride.mockReturnValue(undefined);
    await lastValueFrom(interceptor.intercept(createContext(), handler()));
    await flush();
    expect(record).not.toHaveBeenCalled();
  });

  it('无登录用户（@Public 误标）→ 跳过，不写审计', async () => {
    getAllAndOverride.mockReturnValue({ action: 'member.remove' });
    await lastValueFrom(interceptor.intercept(createContext({ user: undefined }), handler()));
    await flush();
    expect(record).not.toHaveBeenCalled();
  });

  it('成功 → 记 success，detail 用 path 且不含 query string', async () => {
    getAllAndOverride.mockReturnValue({ action: 'member.remove' });
    await lastValueFrom(interceptor.intercept(createContext(), handler()));
    await flush();

    expect(record).toHaveBeenCalledTimes(1);
    const entry = record.mock.calls[0][0];
    expect(entry).toMatchObject({
      tenantId: null,
      actorUserId: 'u1',
      action: 'member.remove',
      result: 'success',
      ip: '1.2.3.4',
    });
    expect(entry.detail.path).toBe('/members/m1');
    expect(entry.detail).not.toHaveProperty('statusCode');
    // AC-11 回归：审计内容绝不能出现令牌
    expect(JSON.stringify(entry)).not.toContain('SECRET');
  });

  it('抛异常 → 记 failed + statusCode，异常继续向上传播', async () => {
    getAllAndOverride.mockReturnValue({ action: 'member.remove' });
    const boom = new NotFoundException('nope');

    await expect(
      lastValueFrom(interceptor.intercept(createContext(), handler(throwError(() => boom)))),
    ).rejects.toBe(boom);
    await flush();

    const entry = record.mock.calls[0][0];
    expect(entry.result).toBe('failed');
    expect(entry.detail.statusCode).toBe(404);
  });

  /**
   * 角色快照。锁住「角色来自 Token 之外的守卫结果」这件事：
   * 拦截器读 req.userRole 就够，不需要为了这个字段查任何表。
   * 成功与失败两条分支都要带上 —— 失败的越权尝试恰恰更需要知道当时是什么身份。
   */
  it('成功与失败分支都把 req.userRole 快照进 detail.actorRole', async () => {
    getAllAndOverride.mockReturnValue({ action: 'member.remove' });
    await lastValueFrom(interceptor.intercept(createContext(), handler()));
    await flush();
    expect(record.mock.calls[0][0].detail.actorRole).toBe('admin');

    record.mockClear();
    await expect(
      lastValueFrom(
        interceptor.intercept(
          createContext({ userRole: 'member' }),
          handler(throwError(() => new NotFoundException('nope'))),
        ),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await flush();
    expect(record.mock.calls[0][0].detail.actorRole).toBe('member');
  });

  it('没有 userRole（@SkipTenant）→ detail 里不写 actorRole 这个键', async () => {
    getAllAndOverride.mockReturnValue({ action: 'member.remove' });
    await lastValueFrom(interceptor.intercept(createContext({ userRole: undefined }), handler()));
    await flush();
    // 写 null 会让「没这个键」和「写了 null」无法区分，读侧反正都归一到 null
    expect(record.mock.calls[0][0].detail).not.toHaveProperty('actorRole');
  });
});
