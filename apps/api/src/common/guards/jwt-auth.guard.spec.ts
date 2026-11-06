import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { describe, beforeEach, it, expect, vi, type Mock } from 'vitest';
import { JwtAuthGuard } from './jwt-auth.guard.ts';

function createContext(authorization?: string) {
  const req: { headers: Record<string, string>; user?: unknown } = {
    headers: authorization ? { authorization } : {},
  };

  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
    // 注意是 getHandler（取路由处理函数），写错成 getHeader 时类型断言会放过去，
    // 要等运行时才报 "context.getHandler is not a function"
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;

  return { context, req };
}

describe('JwtAuthGuard', () => {
  let reflector: { getAllAndOverride: Mock };
  let jwtService: { verifyAsync: Mock };
  let guard: JwtAuthGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: vi.fn() };
    jwtService = { verifyAsync: vi.fn() };
    // 只 stub 用到的两个方法，用 unknown 过渡而不是 any：类型断言写错时仍能被发现
    guard = new JwtAuthGuard(
      reflector as unknown as Reflector,
      jwtService as unknown as JwtService,
    );
  });

  /** 断言抛出 401 且错误码匹配；用 getResponse() 取值，避免依赖 Nest 内部字段 */
  async function expectUnauthorized(context: ExecutionContext, code: string) {
    const error = await guard.canActivate(context).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).getResponse()).toMatchObject({ code });
  }

  it('@Public 路由直接放行，不验令牌', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    await expect(guard.canActivate(createContext().context)).resolves.toBe(true);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('未带 Authorization 头 → UNAUTHORIZED', async () => {
    await expectUnauthorized(createContext().context, 'UNAUTHORIZED');
  });

  it('非 Bearer 格式 → UNAUTHORIZED', async () => {
    await expectUnauthorized(createContext('Basic abc123').context, 'UNAUTHORIZED');
  });

  it('令牌过期 → TOKEN_EXPIRED（前端据此触发 refresh）', async () => {
    jwtService.verifyAsync.mockRejectedValue(
      Object.assign(new Error('jwt expired'), { name: 'TokenExpiredError' }),
    );
    await expectUnauthorized(createContext('Bearer expired-token').context, 'TOKEN_EXPIRED');
  });

  it('签名被篡改 → UNAUTHORIZED', async () => {
    jwtService.verifyAsync.mockRejectedValue(
      Object.assign(new Error('invalid signature'), { name: 'JsonWebTokenError' }),
    );
    await expectUnauthorized(createContext('Bearer tampered').context, 'UNAUTHORIZED');
  });

  it('拿 refresh 令牌冒充 access → UNAUTHORIZED', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 'u1', type: 'refresh' });
    await expectUnauthorized(createContext('Bearer refresh-token').context, 'UNAUTHORIZED');
  });

  it('合法令牌 → 放行并写入 req.user', async () => {
    const payload = { sub: 'u1', type: 'access' as const };
    jwtService.verifyAsync.mockResolvedValue(payload);
    const { context, req } = createContext('Bearer good-token');
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.user).toEqual(payload);
  });
});
