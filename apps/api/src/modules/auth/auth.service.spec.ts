import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import type { Mock } from 'vitest';
import bcrypt from 'bcrypt';
import { AuthService } from './auth.service.ts';
import { TokenService } from './token.service.ts';
import { MailService } from './mail.service.ts';
import { PrismaService } from '../../prisma/prisma.service.ts';

/**
 * AuthService 找回/重置密码的单测。
 *
 * 为什么 mock 而不连库（与 tenants.spec 同一原则）：
 *  - forgotPassword / resetPassword 的核心逻辑是「防枚举分支」「事务边界」「抢占式消费」，
 *    全是纯逻辑，mock 能精确断言「调用参数 + 返回结果」，比连库更精准。
 *  - 真 SQL 能否跑通（字段名、关系过滤语法）由手工冒烟兜底。
 *
 * mock 范围：只 stub 这两个方法实际碰到的 Prisma 方法
 *  - forgotPassword 用：user.findUnique、emailToken.create
 *  - resetPassword 用：emailToken.findFirst、emailToken.updateMany、user.update、
 *    refreshToken.updateMany、$transaction
 */
describe('AuthService - 找回密码', () => {
  let service: AuthService;

  // 每个用例独立重置这些 mock，避免前一个用例的返回值污染下一个
  let userFindUnique: Mock;
  let emailTokenCreate: Mock;
  let emailTokenFindFirst: Mock;
  let emailTokenUpdateMany: Mock;
  let userUpdate: Mock;
  let refreshTokenUpdateMany: Mock;
  let transaction: Mock;
  let sendResetPasswordEmail: Mock;

  beforeEach(async () => {
    userFindUnique = vi.fn();
    emailTokenCreate = vi.fn();
    emailTokenFindFirst = vi.fn();
    emailTokenUpdateMany = vi.fn();
    userUpdate = vi.fn();
    refreshTokenUpdateMany = vi.fn();
    transaction = vi.fn();
    sendResetPasswordEmail = vi.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        // PrismaService：只 stub 用到的方法；$transaction 用一个透传执行器，
        // 让 resetPassword 里的 tx.xxx 直接走真实的 mock（tx 即 prisma 本身）
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: userFindUnique, update: userUpdate },
            emailToken: {
              create: emailTokenCreate,
              findFirst: emailTokenFindFirst,
              updateMany: emailTokenUpdateMany,
            },
            refreshToken: { updateMany: refreshTokenUpdateMany },
            $transaction: transaction,
          },
        },
        // TokenService：hashToken 用真实 sha256 即可（无副作用）；createOpaqueToken 固定返回，
        // 方便断言 create 收到的 tokenHash 与邮件里的明文对应关系
        {
          provide: TokenService,
          useValue: {
            createOpaqueToken: vi.fn(() => 'plaintext-token'),
            hashToken: vi.fn((t: string) => `hash:${t}`),
            signAccessToken: vi.fn(),
            refreshExpiresAt: vi.fn(),
            refreshTtlMs: vi.fn(),
          },
        },
        {
          provide: MailService,
          useValue: { sendResetPasswordEmail },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('forgotPassword', () => {
    it('邮箱不存在：静默成功，不写库不发信，返回 { ok: true }', async () => {
      userFindUnique.mockResolvedValue(null);

      const result = await service.forgotPassword({ email: 'nobody@test.com' });

      expect(result).toEqual({ ok: true });
      // 关键断言：不写 token、不发信（AC-03）
      expect(emailTokenCreate).not.toHaveBeenCalled();
      expect(sendResetPasswordEmail).not.toHaveBeenCalled();
    });

    it('邮箱存在：写 reset_password 令牌（30min TTL + 哈希）+ 发信', async () => {
      userFindUnique.mockResolvedValue({ id: 'u1', email: 'me@test.com' });
      emailTokenCreate.mockResolvedValue({});

      await service.forgotPassword({ email: 'ME@test.com' });

      // 断言写了一条 type=reset_password 的令牌，且 tokenHash 是明文 token 的哈希
      expect(emailTokenCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'u1',
          type: 'reset_password',
          tokenHash: 'hash:plaintext-token',
          payload: {},
        }),
      });
      // TTL = 30 分钟（AC-02）
      const createArg = emailTokenCreate.mock.calls[0][0].data;
      const ttl = createArg.expiresAt.getTime() - Date.now();
      expect(ttl).toBeGreaterThan(29 * 60 * 1000);
      expect(ttl).toBeLessThanOrEqual(30 * 60 * 1000);

      // 发信用的是归一化后的小写邮箱
      expect(sendResetPasswordEmail).toHaveBeenCalledWith('me@test.com', 'plaintext-token');
    });

    it('防枚举：存在与不存在的响应体完全一致（都只有 ok:true）', async () => {
      userFindUnique.mockResolvedValue(null);
      const absent = await service.forgotPassword({ email: 'a@test.com' });

      userFindUnique.mockResolvedValue({ id: 'u1' });
      emailTokenCreate.mockResolvedValue({});
      const present = await service.forgotPassword({ email: 'b@test.com' });

      expect(absent).toEqual(present);
      expect(absent).toEqual({ ok: true });
    });
  });

  describe('resetPassword', () => {
    // 构造一个「有效」的令牌记录，供正常路径用例复用
    const validRecord = {
      id: 't1',
      userId: 'u1',
      type: 'reset_password',
      tokenHash: 'hash:plaintext-token',
      usedAt: null,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    };

    it('正常路径：事务内消费 token + 改密 + 吊销全部 refresh', async () => {
      emailTokenFindFirst.mockResolvedValue(validRecord);
      emailTokenUpdateMany.mockResolvedValue({ count: 1 });
      // $transaction 直接执行回调，tx 即 mock 对象本身（updateMany 返回 count=1）
      transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          emailToken: { updateMany: emailTokenUpdateMany },
          user: { update: userUpdate },
          refreshToken: { updateMany: refreshTokenUpdateMany },
        }),
      );

      const result = await service.resetPassword({
        token: 'plaintext-token',
        password: 'NewPassw0rd1',
      });

      expect(result).toEqual({ ok: true });

      // 抢占式消费：where 带 usedAt:null（防重放）
      expect(emailTokenUpdateMany).toHaveBeenCalledWith({
        where: { id: 't1', usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
      // 改密：bcrypt cost=12 落库
      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { passwordHash: expect.stringMatching(/^\$2[aby]\$\d{2}\$/) },
      });
      // 吊销全部 refresh（AC-08 他端下线）
      expect(refreshTokenUpdateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      // 新密码确实能通过 bcrypt 校验（间接验证成本因子与明文正确）
      const hash = userUpdate.mock.calls[0][0].data.passwordHash;
      expect(await bcrypt.compare('NewPassw0rd1', hash)).toBe(true);
    });

    it.each([
      ['token 不存在', null],
      ['token 已使用', { ...validRecord, usedAt: new Date() }],
      ['token 已过期', { ...validRecord, expiresAt: new Date(Date.now() - 1000) }],
    ])('%s → 抛 400 TOKEN_INVALID', async (_label, record) => {
      emailTokenFindFirst.mockResolvedValue(record);

      await expect(
        service.resetPassword({ token: 'plaintext-token', password: 'NewPassw0rd1' }),
      ).rejects.toThrow(BadRequestException);

      // 无效 token 时不得触碰任何写操作
      expect(emailTokenUpdateMany).not.toHaveBeenCalled();
      expect(userUpdate).not.toHaveBeenCalled();
    });

    it('并发重放：updateMany 影响行数为 0 时抛 TOKEN_INVALID', async () => {
      emailTokenFindFirst.mockResolvedValue(validRecord);
      emailTokenUpdateMany.mockResolvedValue({ count: 0 }); // 已被并发请求消费
      transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          emailToken: { updateMany: emailTokenUpdateMany },
          user: { update: userUpdate },
          refreshToken: { updateMany: refreshTokenUpdateMany },
        }),
      );

      await expect(
        service.resetPassword({ token: 'plaintext-token', password: 'NewPassw0rd1' }),
      ).rejects.toThrow(BadRequestException);
      // 抢不到消费权时，密码不得被修改（半吊子状态防护）
      expect(userUpdate).not.toHaveBeenCalled();
    });
  });
});
