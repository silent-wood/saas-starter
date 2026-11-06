import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, beforeEach, it, expect, vi, type Mock } from 'vitest';
import { RolesGuard } from './roles.guard.ts';

/**
 * RolesGuard 单测。
 *
 * mock 范围：只 mock Reflector.getAllAndOverride（直接喂 @Roles 的返回值）
 * 和一个带 userRole 的 req，不碰数据库。
 *
 * 「不查库」这点由构造函数签名本身保证：这里只传了 reflector 一个依赖，
 * 将来谁给 guard 加了 prisma 依赖，这行 new 会先报类型错，不可能悄悄退化成每请求两次查询。
 */
describe('RolesGuard', () => {
  let getAllAndOverride: Mock;
  let guard: RolesGuard;

  beforeEach(() => {
    getAllAndOverride = vi.fn();
    guard = new RolesGuard({ getAllAndOverride } as unknown as Reflector);
  });

  /**
   * 只造 guard 真正读的字段：switchToHttp().getRequest() 返回的 req.userRole。
   * getHandler / getClass 必须存在 —— 它们的返回值是 getAllAndOverride 的实参，
   * 即使反射结果被 mock，参数也要先求值，否则 TypeError。
   */
  function createContext(userRole?: string) {
    const req = { userRole };
    return {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => () => undefined,
      getClass: () => class {},
    } as unknown as ExecutionContext;
  }

  it('未标 @Roles → 放行（默认放、标注收紧，与 @Public 方向相反）', () => {
    getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('@Roles 传空数组 → 放行', () => {
    getAllAndOverride.mockReturnValue([]);
    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('角色在允许列表 → 放行', () => {
    getAllAndOverride.mockReturnValue(['owner', 'admin']);
    expect(guard.canActivate(createContext('admin'))).toBe(true);
  });

  it('角色不在允许列表 → 403 ROLE_DENIED', () => {
    getAllAndOverride.mockReturnValue(['owner', 'admin']);
    const err = (() => {
      try {
        guard.canActivate(createContext('member'));
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({ code: 'ROLE_DENIED' });
  });

  it('userRole 为空（漏了租户上下文）→ 仍拒绝', () => {
    getAllAndOverride.mockReturnValue(['owner']);
    expect(() => guard.canActivate(createContext(undefined))).toThrow(ForbiddenException);
  });
});
