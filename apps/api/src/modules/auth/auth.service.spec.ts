import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import type { Mock } from 'vitest';
import bcrypt from 'bcrypt';
import { AuthService } from './auth.service.ts';
import { TokenService } from './token.service.ts';
import { MailService } from '../../common/mail/mail.service.ts';
import { AuditService } from '../audit/audit.service.ts';
import { PRISMA } from '../../prisma/prisma.module.ts';

/**
 * AuthService 的单测：找回/重置密码（v1.0）+ 受邀注册（v1.3）。
 *
 * 为什么 mock 而不连库（与 tenants.spec 同一原则）：
 *  - 这些方法的核心逻辑是「防枚举分支」「事务边界」「抢占式消费」「四校验降级」，
 *    全是纯逻辑，mock 能精确断言「调用参数 + 返回结果」，比连库更精准。
 *  - 真 SQL 能否跑通（字段名、关系过滤语法）由手工冒烟兜底。
 *
 * mock 范围：只 stub 这些方法实际碰到的 Prisma 方法
 *  - forgotPassword 用：user.findUnique、emailToken.create
 *  - resetPassword 用：emailToken.findFirst、emailToken.updateMany、user.update、
 *    refreshToken.updateMany、$transaction
 *  - register 用：user.findUnique、invite.findUnique、$transaction（内部 user.create /
 *    user.update / emailToken.updateMany / emailToken.create）
 *  - verifyEmail 用：emailToken.findFirst、refreshToken.create、$transaction
 *    （回调式：内部 emailToken.updateMany / user.update / invite.findUnique /
 *    invite.update / membership.upsert / membership.create / tenant.create；
 *    数组式：写会话那一步）
 */
describe('AuthService - 找回密码', () => {
  let service: AuthService;

  // 每个用例独立重置这些 mock，避免前一个用例的返回值污染下一个
  let userFindUnique: Mock;
  let userCreate: Mock;
  let emailTokenCreate: Mock;
  let emailTokenFindFirst: Mock;
  let emailTokenUpdateMany: Mock;
  let userUpdate: Mock;
  let refreshTokenUpdateMany: Mock;
  let refreshTokenCreate: Mock;
  let transaction: Mock;
  let sendResetPasswordEmail: Mock;
  // v1.3 受邀注册新增
  let inviteFindUnique: Mock;
  let inviteUpdate: Mock;
  let membershipUpsert: Mock;
  let membershipCreate: Mock;
  let tenantCreate: Mock;
  let sendVerifyEmail: Mock;
  let auditRecord: Mock;

  beforeEach(async () => {
    userFindUnique = vi.fn();
    userCreate = vi.fn();
    emailTokenCreate = vi.fn();
    emailTokenFindFirst = vi.fn();
    emailTokenUpdateMany = vi.fn();
    userUpdate = vi.fn();
    refreshTokenUpdateMany = vi.fn();
    refreshTokenCreate = vi.fn();
    transaction = vi.fn();
    sendResetPasswordEmail = vi.fn();
    inviteFindUnique = vi.fn();
    inviteUpdate = vi.fn();
    membershipUpsert = vi.fn();
    membershipCreate = vi.fn();
    tenantCreate = vi.fn();
    sendVerifyEmail = vi.fn();
    auditRecord = vi.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        // Prisma client（PRISMA token）：只 stub 用到的方法；$transaction 用一个透传执行器，
        // 让事务回调里的 tx.xxx 直接走真实的 mock（tx 即 prisma 本身）
        {
          provide: PRISMA,
          useValue: {
            user: { findUnique: userFindUnique, update: userUpdate, create: userCreate },
            emailToken: {
              create: emailTokenCreate,
              findFirst: emailTokenFindFirst,
              updateMany: emailTokenUpdateMany,
            },
            refreshToken: { updateMany: refreshTokenUpdateMany, create: refreshTokenCreate },
            invite: { findUnique: inviteFindUnique, update: inviteUpdate },
            membership: { upsert: membershipUpsert, create: membershipCreate },
            tenant: { create: tenantCreate },
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
            signAccessToken: vi.fn(async () => 'access-token'),
            refreshExpiresAt: vi.fn(() => new Date('2030-01-01T00:00:00.000Z')),
            refreshTtlMs: vi.fn(),
          },
        },
        {
          provide: MailService,
          useValue: { sendResetPasswordEmail, sendVerifyEmail },
        },
        // 登录审计的旁路写入（05 方案 AC-15 / v1.4 的验证即登录）。本文件只在
        // 「验证即登录」那条用例里断言它，其余用例不关心
        {
          provide: AuditService,
          useValue: { record: auditRecord },
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

  // ─────────────────────────────────────────────────────────
  // v1.3 受邀注册（方案 01 §2.5 / AC-23~30）
  // ─────────────────────────────────────────────────────────

  /** 一条「四校验全中」的邀请，各用例在它基础上改一处来制造失败分支 */
  const validInvite = {
    id: 'inv1',
    tenantId: 't_1',
    email: 'invitee@test.com',
    role: 'member',
    status: 'pending',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    invitedBy: 'u_owner',
    tenant: { deletedAt: null },
  };

  /**
   * 事务透传执行器：回调式事务把 tx 直接给到下面这组 mock；
   * 数组式事务（`$transaction([...])`，verifyEmail 写会话那一步用的就是它）直接 await。
   * 两种形态都要认——只处理回调式，数组式会把数组当函数调，报「arg is not a function」。
   */
  const runTx = () =>
    transaction.mockImplementation(async (arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => Promise<unknown>)({
            emailToken: { updateMany: emailTokenUpdateMany, create: emailTokenCreate },
            user: { update: userUpdate, create: userCreate },
            invite: { findUnique: inviteFindUnique, update: inviteUpdate },
            membership: { upsert: membershipUpsert, create: membershipCreate },
            tenant: { create: tenantCreate },
          })
        : Promise.all(arg as Promise<unknown>[]),
    );

  describe('register（受邀注册）', () => {
    /** 新账号 + 验证令牌落库的最小前提 */
    const prepareNewAccount = () => {
      userFindUnique.mockResolvedValue(null);
      userCreate.mockResolvedValue({ id: 'u1' });
      emailTokenCreate.mockResolvedValue({});
      runTx();
    };

    it('四校验全中：payload 写 skipTenant + inviteId，不写团队名', async () => {
      prepareNewAccount();
      inviteFindUnique.mockResolvedValue(validInvite);

      await service.register({
        name: '张三',
        email: 'Invitee@test.com',
        password: 'Passw0rd1',
        inviteToken: 'invite-token',
      });

      // 按 tokenHash 查，不是按明文
      expect(inviteFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: 'hash:invite-token' } }),
      );
      // 关键：payload 不出现 tenantName，验证时才不建默认团队
      expect(emailTokenCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ payload: { skipTenant: true, inviteId: 'inv1' } }),
      });
    });

    it.each([
      ['token 查不到', null],
      ['已被接受', { ...validInvite, status: 'accepted' }],
      ['已被撤销', { ...validInvite, status: 'revoked' }],
      ['已过期', { ...validInvite, expiresAt: new Date(Date.now() - 1000) }],
      ['邮箱不一致', { ...validInvite, email: 'someone-else@test.com' }],
      ['团队已软删', { ...validInvite, tenant: { deletedAt: new Date() } }],
    ])('%s → 静默降级为普通注册', async (_label, invite) => {
      prepareNewAccount();
      inviteFindUnique.mockResolvedValue(invite);

      // 不抛错是这个用例的重点：注册不该因为邀请失效而失败（AC-25）
      await expect(
        service.register({
          name: '张三',
          email: 'invitee@test.com',
          password: 'Passw0rd1',
          tenantName: '我的团队',
          inviteToken: 'bad-token',
        }),
      ).resolves.toEqual({ userId: 'u1', email: 'invitee@test.com' });

      expect(emailTokenCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ payload: { tenantName: '我的团队' } }),
      });
    });

    it('已存在未验证账号：即使邀请有效也不跳过团队（它可能已在别处注册过）', async () => {
      userFindUnique.mockResolvedValue({ id: 'u1', emailVerifiedAt: null });
      userUpdate.mockResolvedValue({});
      emailTokenUpdateMany.mockResolvedValue({ count: 1 });
      emailTokenCreate.mockResolvedValue({});
      runTx();

      await service.register({
        name: '张三',
        email: 'invitee@test.com',
        password: 'Passw0rd1',
        tenantName: '我的团队',
        inviteToken: 'invite-token',
      });

      // 连查都不查，避免「老账号被邀请改道」导致它永远没有自己的团队
      expect(inviteFindUnique).not.toHaveBeenCalled();
      expect(emailTokenCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ payload: { tenantName: '我的团队' } }),
      });
    });
  });

  describe('verifyEmail', () => {
    /** 令牌记录；payload 按用例给 */
    const recordWith = (payload: unknown) => ({
      id: 't1',
      userId: 'u1',
      type: 'verify_email',
      tokenHash: 'hash:plaintext-token',
      usedAt: null,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      payload,
      user: { id: 'u1', email: 'invitee@test.com', nickname: '张三', emailVerifiedAt: null },
    });

    beforeEach(() => {
      emailTokenUpdateMany.mockResolvedValue({ count: 1 });
      userUpdate.mockResolvedValue({});
      runTx();
    });

    it('邀请仍有效：加入团队并消费邀请，不建租户', async () => {
      emailTokenFindFirst.mockResolvedValue(recordWith({ skipTenant: true, inviteId: 'inv1' }));
      inviteFindUnique.mockResolvedValue(validInvite);

      const result = await service.verifyEmail('plaintext-token');

      expect(result).toMatchObject({ verified: true, tenantId: 't_1' });

      // upsert 而不是 create：被移出过的人身上已有 removed 行（唯一约束决定只能复用）
      expect(membershipUpsert).toHaveBeenCalledWith({
        where: { tenantId_userId: { tenantId: 't_1', userId: 'u1' } },
        update: { status: 'active', role: 'member' },
        create: expect.objectContaining({
          tenantId: 't_1',
          userId: 'u1',
          role: 'member',
          status: 'active',
          invitedBy: 'u_owner',
        }),
      });
      expect(inviteUpdate).toHaveBeenCalledWith({
        where: { id: 'inv1' },
        data: expect.objectContaining({ status: 'accepted', acceptedBy: 'u1' }),
      });
      // 受邀注册的核心：绝不建默认团队
      expect(tenantCreate).not.toHaveBeenCalled();
    });

    it.each([
      ['已被撤销', { ...validInvite, status: 'revoked' }],
      ['已过期', { ...validInvite, expiresAt: new Date(Date.now() - 1000) }],
      ['团队已软删', { ...validInvite, tenant: { deletedAt: new Date() } }],
      ['邮箱已变（脏数据）', { ...validInvite, email: 'other@test.com' }],
    ])('邀请在注册后失效（%s）→ 建兜底团队', async (_label, invite) => {
      emailTokenFindFirst.mockResolvedValue(recordWith({ skipTenant: true, inviteId: 'inv1' }));
      inviteFindUnique.mockResolvedValue(invite);
      tenantCreate.mockResolvedValue({ id: 't_fallback' });

      const result = await service.verifyEmail('plaintext-token');

      expect(result).toMatchObject({ verified: true, tenantId: 't_fallback' });
      expect(tenantCreate).toHaveBeenCalledWith({
        data: { name: '张三 的团队', ownerId: 'u1' },
      });
      expect(membershipCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ tenantId: 't_fallback', role: 'owner', status: 'active' }),
      });
      // 邀请没被消费，管理员那边它仍是 pending（可以重发/撤销）
      expect(inviteUpdate).not.toHaveBeenCalled();
      expect(membershipUpsert).not.toHaveBeenCalled();
    });

    it('普通注册：按 payload 的 tenantName 建团队并成为 owner', async () => {
      emailTokenFindFirst.mockResolvedValue(recordWith({ tenantName: '星河科技' }));
      tenantCreate.mockResolvedValue({ id: 't_2' });

      const result = await service.verifyEmail('plaintext-token');

      expect(result).toMatchObject({ verified: true, tenantId: 't_2' });
      expect(tenantCreate).toHaveBeenCalledWith({
        data: { name: '星河科技', ownerId: 'u1' },
      });
      expect(membershipCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ role: 'owner' }),
      });
      expect(inviteFindUnique).not.toHaveBeenCalled();
    });

    /**
     * v1.4「验证即登录」的核心断言：验证通过 = 一次登录，令牌与会话记录都要有。
     * 少任何一项，前端就只能把用户再送回登录页（这正是要消灭的那一步）。
     */
    it('验证通过即登录：下发 access + refresh，落会话记录，用户带 emailVerified', async () => {
      emailTokenFindFirst.mockResolvedValue(recordWith({ tenantName: '星河科技' }));
      tenantCreate.mockResolvedValue({ id: 't_2' });
      auditRecord.mockClear();

      const result = await service.verifyEmail('plaintext-token', '10.0.0.8');

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('plaintext-token');
      // 事务前读出来的 user 快照 emailVerifiedAt 还是 null，返回体必须是已验证
      expect(result.user).toMatchObject({ id: 'u1', emailVerified: true });
      // refresh 只存哈希，明文只出现在 cookie 里
      expect(refreshTokenCreate).toHaveBeenCalledWith({
        data: {
          userId: 'u1',
          tokenHash: 'hash:plaintext-token',
          expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        },
      });
      // 登录时间与 login 一致地更新，审计里能看出这是一次登录
      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { lastLoginAt: expect.any(Date) },
      });
      expect(auditRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'auth.login',
          actorUserId: 'u1',
          ip: '10.0.0.8',
          detail: { method: 'POST', path: '/auth/verify-email' },
        }),
      );
    });

    it('payload 的 tenantName 是空串（老数据）→ 用「昵称 的团队」兜底', async () => {
      emailTokenFindFirst.mockResolvedValue(recordWith({ tenantName: '   ' }));
      tenantCreate.mockResolvedValue({ id: 't_3' });

      await service.verifyEmail('plaintext-token');

      expect(tenantCreate).toHaveBeenCalledWith({
        data: { name: '张三 的团队', ownerId: 'u1' },
      });
    });
  });
});
