import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { describe, beforeEach, it, expect, vi, type Mock } from 'vitest';
import { TenantGuard } from './tenant.guard.ts';
import type { ExtendedPrismaClient } from '../../prisma/prisma.service.ts';

/**
 * TenantGuard 单测。
 *
 * 为什么 mock 而不连库（与 auth.service.spec 同一原则）：
 *   guard 的核心逻辑是「缺头拒绝 / 查 membership / 挂 role」三条分支，全是纯逻辑，
 *   mock 掉 membership.findFirst 即可精确断言「调用参数 + 返回结果」。
 *   真 SQL 能否跑通（字段名、关系过滤）由手工冒烟兜底。
 *
 * mock 范围：guard 只碰 prisma.membership.findFirst 一个方法。
 *   注意 membership 不在租户扩展白名单里，所以这里 mock 的 findFirst
 *   就是「未被扩展污染」的干净查询（这正是 guard 能正确工作的前提）。
 */
describe('TenantGuard', () => {
  let membershipFindFirst: Mock;
  let guard: TenantGuard;

  beforeEach(() => {
    membershipFindFirst = vi.fn();
    // 用 useValue 直接构造 guard：只实现它用到的 membership.findFirst。
    // as unknown as ExtendedPrismaClient：mock 只实现了完整 client 的一小部分，
    // 用 unknown 过渡而不是 any，类型断言写错时仍能被发现
    guard = new TenantGuard({
      membership: { findFirst: membershipFindFirst },
    } as unknown as ExtendedPrismaClient);
  });

  /**
   * 构造模拟的 ExecutionContext。
   * guard 只用到 req.headers['x-tenant-id']、req.user.sub，以及往 req 写 userRole，
   * 所以这里只造这三个字段；其余用 unknown 断言过渡。
   */
  function createContext(opts: { tenantId?: string; userId?: string }) {
    const req: Record<string, unknown> = {
      headers: opts.tenantId ? { 'x-tenant-id': opts.tenantId } : {},
      user: { sub: opts.userId ?? 'u1' },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    return { context, req };
  }

  /** 断言抛出 403 且 code=TENANT_MISMATCH；用 getResponse() 取值，避免依赖 Nest 内部字段 */
  async function expectForbidden(context: ExecutionContext) {
    const error = await guard.canActivate(context).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({
      code: 'TENANT_MISMATCH',
    });
  }

  it('缺少 X-Tenant-Id 头 → 403 TENANT_MISMATCH，且不查库', async () => {
    await expectForbidden(createContext({ tenantId: undefined }).context);
    // 缺头时根本不该去查 membership
    expect(membershipFindFirst).not.toHaveBeenCalled();
  });

  it('X-Tenant-Id 为空字符串 → 403 TENANT_MISMATCH，且不查库', async () => {
    await expectForbidden(createContext({ tenantId: '' }).context);
    expect(membershipFindFirst).not.toHaveBeenCalled();
  });

  it('该用户在此租户无 active membership → 403 TENANT_MISMATCH', async () => {
    membershipFindFirst.mockResolvedValue(null);
    await expectForbidden(createContext({ tenantId: 'tenant-a' }).context);
  });

  it('membership 存在 → 放行，按 userId+tenantId+active 查询，并把 role 挂到 req', async () => {
    membershipFindFirst.mockResolvedValue({ role: 'owner' });
    const { context, req } = createContext({ tenantId: 'tenant-a', userId: 'u1' });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    // 关键断言：查询条件必须带 status:'active'（disabled/removed 的成员不算有权）
    expect(membershipFindFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', tenantId: 'tenant-a', status: 'active' },
      select: { role: true },
    });
    // role 挂到请求上，供后续 RBAC 使用
    expect(req.userRole).toBe('owner');
  });
});
