import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { SKIP_TENANT_KEY } from '../../common/decorators/skip-tenant.decorator.ts';
import { AuthController } from './auth.controller.ts';

/**
 * 认证控制器的「租户豁免」回归用例。
 *
 * 背景：`@Public()` 只跳 JwtAuthGuard，TenantGuard 照旧要求 `X-Tenant-Id`。
 * 03 实现租户隔离后，`/auth/*` 一度因为只标了 `@Public()` 而全部 403
 * `TENANT_MISMATCH 缺少租户上下文` —— 登录、注册、找回密码整条链路同时不可用，
 * 且单测（service 层 mock）全部是绿的，只有手工冒烟才会暴露。
 *
 * 所以这里断言的是「元数据在不在」，而不是行为：控制器一旦漏标类级 `@SkipTenant`，
 * 这条用例会先炸，不用等到有人手点登录页。
 */
describe('AuthController 租户豁免', () => {
  it('控制器类级标了 @SkipTenant', () => {
    const reflector = new Reflector();
    expect(reflector.get(SKIP_TENANT_KEY, AuthController)).toBe(true);
  });

  it('所有路由处理器都能继承类级豁免（getAllAndOverride 回落到类元数据）', () => {
    const reflector = new Reflector();
    const proto = AuthController.prototype as unknown as Record<string, unknown>;
    const methods = Object.getOwnPropertyNames(proto).filter(
      (name) => name !== 'constructor' && typeof proto[name] === 'function',
    );

    // 认证接口 8 个（register/verify-email/forgot-password/reset-password/login/refresh/logout/me）
    expect(methods.length).toBeGreaterThanOrEqual(8);
    for (const name of methods) {
      const handler = proto[name] as () => unknown;
      expect(reflector.getAllAndOverride(SKIP_TENANT_KEY, [handler, AuthController]), name).toBe(
        true,
      );
    }
  });
});
