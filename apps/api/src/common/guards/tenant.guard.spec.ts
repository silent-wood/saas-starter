import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, beforeEach, it, expect, vi, type Mock } from 'vitest';
import type { ExtendedPrismaClient } from '../../prisma/prisma.service.ts';
import { TenantGuard } from './tenant.guard.ts';

/**
 * TenantGuard 单测。
 *
 * 为什么 mock 而不连库（与 auth.service.spec 同一原则）：
 *   guard 的核心逻辑是「@SkipTenant 跳过 / 缺头拒绝 / 查 membership / 挂 role」四条分支，
 *   全是纯逻辑，mock 掉 membership.findFirst 就能精确断言调用参数与结果。
 *   真 SQL 能否跑通（字段名、status:'active' 过滤）由手工冒烟兜底。
 *
 * mock 范围：Reflector.getAllAndOverride（读 @SkipTenant）+ prisma.membership.findFirst。
 *   注意 membership 不在租户扩展白名单里，所以这里 mock 到的就是「未被扩展污染」的干净查询 ——
 *   这正是 guard 能正确工作的前提，一旦谁把 Membership 加进白名单，此处参数断言会先炸。
 */
describe('TenantGuard', () => {
  let membershipFindFirst: Mock;
  let getAllAndOverride: Mock;
  let guard: TenantGuard;

  beforeEach(() => {
    membershipFindFirst = vi.fn();
    getAllAndOverride = vi.fn().mockReturnValue(undefined);
    guard = new TenantGuard(
      { getAllAndOverride } as unknown as Reflector,
      {
        membership: { findFirst: membershipFindFirst },
      } as unknown as ExtendedPrismaClient,
    );
  });

  /**
   * 构造模拟 ExecutionContext。
   * getHandler / getClass 必须存在：guard 会把它们的返回值作为参数传给 reflector，
   * 即使反射结果被 mock，参数也要先求值。
   */
  function createContext(opts: { tenantId?: string; userId?: string }) {
    const req: Record<string, unknown> = {
      headers: opts.tenantId ? { 'x-tenant-id': opts.tenantId } : {},
      user: { sub: opts.userId ?? 'u1' },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => () => undefined,
      getClass: () => class {},
    } as unknown as ExecutionContext;
    return { context, req };
  }

  /** 断言 403 且 code=TENANT_MISMATCH；用 getResponse() 取值，不依赖 Nest 内部字段 */
  async function expectForbidden(context: ExecutionContext) {
    const error = await guard.canActivate(context).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({
      code: 'TENANT_MISMATCH',
    });
  }

  it('缺少 X-Tenant-Id 头 → 403，且不查库', async () => {
    await expectForbidden(createContext({ tenantId: undefined }).context);
    expect(membershipFindFirst).not.toHaveBeenCalled();
  });

  it('X-Tenant-Id 为空字符串 → 403，且不查库', async () => {
    await expectForbidden(createContext({ tenantId: '' }).context);
    expect(membershipFindFirst).not.toHaveBeenCalled();
  });

  it('无 active membership → 403', async () => {
    membershipFindFirst.mockResolvedValue(null);
    await expectForbidden(createContext({ tenantId: 'tenant-a' }).context);
  });

  it('membership 存在 → 放行，按 userId+tenantId+active 查询并挂 role', async () => {
    membershipFindFirst.mockResolvedValue({ role: 'owner' });
    const { context, req } = createContext({ tenantId: 'tenant-a', userId: 'u1' });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(membershipFindFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', tenantId: 'tenant-a', status: 'active' },
      select: { role: true },
    });
    expect(req.userRole).toBe('owner');
  });

  // 回归用例：03 的遗留缺陷 —— /tenants、/auth/me 不该要求租户上下文
  it('标了 @SkipTenant → 直接放行，不查库也不要求头', async () => {
    getAllAndOverride.mockReturnValue(true);
    const { context } = createContext({ tenantId: undefined });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(membershipFindFirst).not.toHaveBeenCalled();
  });
});
