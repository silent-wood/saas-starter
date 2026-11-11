import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { Mock } from 'vitest';
import { ERROR_CODES } from '@saas/shared';
import { MembersService } from './members.service.ts';
import { PRISMA } from '../../prisma/prisma.module.ts';
import { tenantContext } from '../../prisma/tenant.extension.ts';
import { MailService } from '../../common/mail/mail.service.ts';
import { TokenService } from '../auth/token.service.ts';

/**
 * MembersService 单测。
 *
 * mock 而不是连库的理由与 tenants.spec 一致：被测的是「过滤条件/事务边界/对象级规则
 * 怎么传给 Prisma」，这些是纯逻辑；真 SQL 能不能跑由手工冒烟兜底（05 方案 §5.3）。
 *
 * 两个测试基建值得记住：
 *  1. `requireTenantId()` 读 AsyncLocalStorage，所以**每个用例都要包在
 *     `tenantContext.run({ tenantId }, ...)` 里**，否则会直接 403（这是有意的 fail-closed）。
 *  2. `$transaction` 在 service 里用了两种形态：数组（并列写入）与回调（这里没用到回调），
 *     mock 成「数组就 Promise.all，函数就立即执行」即可。
 */

const TENANT_ID = 't1';
const ACTOR_OWNER = { userId: 'u_owner', role: 'owner' as const };
const ACTOR_ADMIN = { userId: 'u_admin', role: 'admin' as const };

/** 把调用包进租户上下文，模拟 TenantContextMiddleware 建立的环境 */
const inTenant = <T>(fn: () => Promise<T>): Promise<T> =>
  tenantContext.run({ tenantId: TENANT_ID }, fn);

describe('MembersService', () => {
  let service: MembersService;

  // prisma 上的方法按被测方法实际用到的最小集合 stub
  let userFindUnique: Mock;
  let membershipFindUnique: Mock;
  let membershipFindFirst: Mock;
  let membershipFindMany: Mock;
  let membershipCreate: Mock;
  let membershipUpdate: Mock;
  let inviteFindFirst: Mock;
  let inviteFindUnique: Mock;
  let inviteFindMany: Mock;
  let inviteCreate: Mock;
  let inviteUpdate: Mock;
  let tenantFindUnique: Mock;
  let tenantUpdate: Mock;
  let transaction: Mock;
  let sendInviteEmail: Mock;

  const memberRow = (over: Record<string, unknown> = {}) => ({
    id: 'm_admin',
    userId: 'u_admin',
    role: 'admin',
    status: 'active',
    joinedAt: new Date('2026-11-01T00:00:00.000Z'),
    user: { nickname: '王五', email: 'admin@test.com', avatarUrl: null },
    ...over,
  });

  beforeEach(async () => {
    userFindUnique = vi.fn();
    membershipFindUnique = vi.fn();
    membershipFindFirst = vi.fn();
    membershipFindMany = vi.fn().mockResolvedValue([]);
    membershipCreate = vi.fn().mockResolvedValue({});
    membershipUpdate = vi.fn().mockResolvedValue(memberRow());
    inviteFindFirst = vi.fn().mockResolvedValue(null);
    inviteFindUnique = vi.fn();
    inviteFindMany = vi.fn().mockResolvedValue([]);
    inviteCreate = vi.fn().mockResolvedValue({
      id: 'i1',
      email: 'new@test.com',
      role: 'member',
      expiresAt: new Date('2026-11-18T00:00:00.000Z'),
      createdAt: new Date('2026-11-11T00:00:00.000Z'),
    });
    inviteUpdate = vi.fn().mockResolvedValue({
      id: 'i1',
      email: 'new@test.com',
      role: 'member',
      expiresAt: new Date('2026-11-18T00:00:00.000Z'),
      createdAt: new Date('2026-11-11T00:00:00.000Z'),
    });
    tenantFindUnique = vi.fn().mockResolvedValue({ id: TENANT_ID, name: '星河科技' });
    tenantUpdate = vi.fn().mockResolvedValue({});
    // $transaction 两种形态：数组 → 并行执行；回调 → 立即执行并把「tx」交回去（这里 tx 就用同一批 mock）
    transaction = vi.fn(async (arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => unknown)({
            membership: { create: membershipCreate, update: membershipUpdate },
            invite: { update: inviteUpdate },
          })
        : Promise.all(arg as Promise<unknown>[]),
    );
    sendInviteEmail = vi.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembersService,
        {
          provide: PRISMA,
          useValue: {
            user: { findUnique: userFindUnique },
            membership: {
              findUnique: membershipFindUnique,
              findFirst: membershipFindFirst,
              findMany: membershipFindMany,
              create: membershipCreate,
              update: membershipUpdate,
            },
            invite: {
              findFirst: inviteFindFirst,
              findUnique: inviteFindUnique,
              findMany: inviteFindMany,
              create: inviteCreate,
              update: inviteUpdate,
            },
            tenant: { findUnique: tenantFindUnique, update: tenantUpdate },
            $transaction: transaction,
          },
        },
        {
          provide: MailService,
          useValue: { sendInviteEmail },
        },
        {
          provide: TokenService,
          // 固定明文，方便断言「库里存的是 hash、响应里是明文」
          useValue: {
            createOpaqueToken: vi.fn(() => 'plaintext-invite-token'),
            hashToken: vi.fn((t: string) => `hash:${t}`),
          },
        },
        {
          provide: ConfigService,
          useValue: { getOrThrow: vi.fn(() => 'https://app.test') },
        },
      ],
    }).compile();

    service = module.get<MembersService>(MembersService);
  });

  // ───────────── 邀请 ─────────────

  describe('invite', () => {
    it('新邮箱：落库只存 hash，响应里给明文链接，并发信', async () => {
      userFindUnique
        .mockResolvedValueOnce({ nickname: '李顺', email: 'owner@test.com' }) // 邀请人
        .mockResolvedValueOnce(null); // 目标用户未注册

      const result = await inTenant(() =>
        service.invite({ email: ' New@Test.com ', role: 'member' }, ACTOR_OWNER),
      );

      const created = inviteCreate.mock.calls[0][0].data;
      expect(created.tokenHash).toBe('hash:plaintext-invite-token');
      expect(created.email).toBe('new@test.com'); // 邮箱统一小写归一化
      expect(created.tenantId).toBe(TENANT_ID);
      // 有效期 7 天（放 6.9 天 ~ 7.1 天之间，避免断言卡在毫秒上）
      const ttl = created.expiresAt.getTime() - Date.now();
      expect(ttl).toBeGreaterThan(6.9 * 24 * 3600 * 1000);
      expect(ttl).toBeLessThan(7.1 * 24 * 3600 * 1000);

      // 明文只出现在 joinUrl 里
      expect(result.joinUrl).toBe('https://app.test/join?token=plaintext-invite-token');
      expect(sendInviteEmail).toHaveBeenCalledWith(
        'new@test.com',
        expect.objectContaining({ tenantName: '星河科技', inviterName: '李顺' }),
      );
    });

    it('同邮箱已有未过期邀请：复用该行并轮换 token，不新建', async () => {
      userFindUnique
        .mockResolvedValueOnce({ nickname: '李顺', email: 'owner@test.com' })
        .mockResolvedValueOnce(null);
      inviteFindFirst.mockResolvedValue({ id: 'i_old' });

      await inTenant(() => service.invite({ email: 'new@test.com', role: 'admin' }, ACTOR_OWNER));

      expect(inviteCreate).not.toHaveBeenCalled();
      expect(inviteUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'i_old' },
          data: expect.objectContaining({ role: 'admin', status: 'pending' }),
        }),
      );
    });

    it('邮箱已是 active 成员 → 409 MEMBER_STATE_INVALID，不落库不发信', async () => {
      userFindUnique
        .mockResolvedValueOnce({ nickname: '李顺', email: 'owner@test.com' })
        .mockResolvedValueOnce({ id: 'u_member' });
      membershipFindUnique.mockResolvedValue({ status: 'active' });

      await expect(
        inTenant(() => service.invite({ email: 'member@test.com', role: 'member' }, ACTOR_OWNER)),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: ERROR_CODES.MEMBER_STATE_INVALID },
      });
      expect(inviteCreate).not.toHaveBeenCalled();
      expect(sendInviteEmail).not.toHaveBeenCalled();
    });

    it('禁用成员不能被邀请绕过（需先启用）', async () => {
      userFindUnique
        .mockResolvedValueOnce({ nickname: '李顺', email: 'owner@test.com' })
        .mockResolvedValueOnce({ id: 'u_member' });
      membershipFindUnique.mockResolvedValue({ status: 'disabled' });

      await expect(
        inTenant(() => service.invite({ email: 'member@test.com', role: 'member' }, ACTOR_OWNER)),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('邀请自己 → 409', async () => {
      userFindUnique.mockResolvedValueOnce({ nickname: '李顺', email: 'owner@test.com' });

      await expect(
        inTenant(() => service.invite({ email: 'OWNER@test.com', role: 'member' }, ACTOR_OWNER)),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  // ───────────── 接受邀请 ─────────────

  describe('acceptInvite', () => {
    const pendingInvite = (over: Record<string, unknown> = {}) => ({
      id: 'i1',
      tenantId: TENANT_ID,
      email: 'new@test.com',
      role: 'member',
      status: 'pending',
      invitedBy: 'u_owner',
      expiresAt: new Date(Date.now() + 3 * 24 * 3600 * 1000),
      tenant: { id: TENANT_ID, name: '星河科技', deletedAt: null },
      ...over,
    });

    it('正常接受：建成员 + 邀请置 accepted，返回租户项', async () => {
      inviteFindUnique.mockResolvedValue(pendingInvite());
      userFindUnique.mockResolvedValue({ id: 'u_new', email: 'new@test.com' });
      membershipFindUnique.mockResolvedValue(null);

      const result = await service.acceptInvite('plaintext-invite-token', 'u_new');

      expect(membershipCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          userId: 'u_new',
          role: 'member',
          status: 'active',
        }),
      });
      expect(inviteUpdate).toHaveBeenCalledWith({
        where: { id: 'i1' },
        data: expect.objectContaining({ status: 'accepted', acceptedBy: 'u_new' }),
      });
      expect(result).toEqual({
        id: TENANT_ID,
        name: '星河科技',
        role: 'member',
        status: 'active',
        lastActiveAt: null,
      });
    });

    it('被移除过的成员：复用原行改回 active，不新建（唯一约束决定只能复用）', async () => {
      inviteFindUnique.mockResolvedValue(pendingInvite());
      userFindUnique.mockResolvedValue({ id: 'u_new', email: 'new@test.com' });
      membershipFindUnique.mockResolvedValue({ id: 'm_old', status: 'removed' });

      await service.acceptInvite('plaintext-invite-token', 'u_new');

      expect(membershipCreate).not.toHaveBeenCalled();
      expect(membershipUpdate).toHaveBeenCalledWith({
        where: { id: 'm_old' },
        data: { status: 'active', role: 'member' },
      });
    });

    it('已 disabled 的成员：409，邀请不能绕过管理员的禁用', async () => {
      inviteFindUnique.mockResolvedValue(pendingInvite());
      userFindUnique.mockResolvedValue({ id: 'u_new', email: 'new@test.com' });
      membershipFindUnique.mockResolvedValue({ id: 'm_old', status: 'disabled' });

      await expect(service.acceptInvite('t', 'u_new')).rejects.toMatchObject({ status: 409 });
      expect(transaction).not.toHaveBeenCalled();
    });

    it('登录邮箱与邀请邮箱不一致 → 409（链接转发给别人无效）', async () => {
      inviteFindUnique.mockResolvedValue(pendingInvite());
      userFindUnique.mockResolvedValue({ id: 'u_other', email: 'other@test.com' });

      await expect(service.acceptInvite('t', 'u_other')).rejects.toMatchObject({
        status: 409,
        response: { code: ERROR_CODES.MEMBER_STATE_INVALID },
      });
    });

    it('已过期 → 410 TOKEN_INVALID，不做任何写入', async () => {
      inviteFindUnique.mockResolvedValue(pendingInvite({ expiresAt: new Date(Date.now() - 1000) }));
      userFindUnique.mockResolvedValue({ id: 'u_new', email: 'new@test.com' });
      membershipFindUnique.mockResolvedValue(null);

      await expect(service.acceptInvite('t', 'u_new')).rejects.toMatchObject({
        status: 410,
        response: { code: ERROR_CODES.TOKEN_INVALID },
      });
      expect(transaction).not.toHaveBeenCalled();
    });

    it('已被接受过且用户已是成员：幂等返回租户项，不重复写入', async () => {
      inviteFindUnique.mockResolvedValue(pendingInvite({ status: 'accepted' }));
      userFindUnique.mockResolvedValue({ id: 'u_new', email: 'new@test.com' });
      membershipFindUnique.mockResolvedValue({ id: 'm1', status: 'active' });

      const result = await service.acceptInvite('t', 'u_new');

      expect(result.id).toBe(TENANT_ID);
      expect(transaction).not.toHaveBeenCalled();
    });
  });

  // ───────────── 成员操作的对象级规则 ─────────────

  describe('对象级规则', () => {
    it('admin 改 member 的角色：放行并写库', async () => {
      membershipFindFirst.mockResolvedValue(memberRow({ role: 'member', userId: 'u_m' }));

      await inTenant(() => service.updateRole('m_member', { role: 'admin' }, ACTOR_ADMIN));

      expect(membershipUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'm_admin' }, data: { role: 'admin' } }),
      );
    });

    it('admin 改 admin：403 ROLE_DENIED（同级不能互降）', async () => {
      membershipFindFirst.mockResolvedValue(memberRow({ role: 'admin', userId: 'u_other' }));

      await expect(
        inTenant(() => service.updateRole('m_admin', { role: 'member' }, ACTOR_ADMIN)),
      ).rejects.toMatchObject({ status: 403, response: { code: ERROR_CODES.ROLE_DENIED } });
      expect(membershipUpdate).not.toHaveBeenCalled();
    });

    it('目标是 owner：改角色 → 409 OWNER_TRANSFER_INVALID（引导去转让）', async () => {
      membershipFindFirst.mockResolvedValue(memberRow({ role: 'owner', userId: 'u_owner2' }));

      await expect(
        inTenant(() => service.updateRole('m_owner', { role: 'member' }, ACTOR_ADMIN)),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: ERROR_CODES.OWNER_TRANSFER_INVALID },
      });
    });

    it('目标是 owner：禁用/移除 → 409 MEMBER_STATE_INVALID（转让解决不了「我要禁掉他」）', async () => {
      membershipFindFirst.mockResolvedValue(memberRow({ role: 'owner', userId: 'u_owner2' }));

      await expect(
        inTenant(() => service.setStatus('m_owner', 'disabled', ACTOR_ADMIN)),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: ERROR_CODES.MEMBER_STATE_INVALID },
      });
    });

    it('不能操作自己（含 owner 自己那一行）', async () => {
      membershipFindFirst.mockResolvedValue(
        memberRow({ role: 'admin', userId: ACTOR_ADMIN.userId }),
      );

      await expect(inTenant(() => service.remove('m_admin', ACTOR_ADMIN))).rejects.toMatchObject({
        status: 409,
      });
      expect(membershipUpdate).not.toHaveBeenCalled();
    });

    it('移除只改状态不删行', async () => {
      membershipFindFirst.mockResolvedValue(memberRow({ role: 'member', userId: 'u_m' }));

      const result = await inTenant(() => service.remove('m_member', ACTOR_OWNER));

      expect(membershipUpdate).toHaveBeenCalledWith({
        where: { id: 'm_admin' },
        data: { status: 'removed' },
      });
      expect(result).toEqual({ id: 'm_admin' });
    });
  });

  // ───────────── 转让所有权 ─────────────

  describe('transferOwner', () => {
    it('三条写入同事务：租户 ownerId + 目标升 owner + 自己降 admin', async () => {
      membershipFindFirst.mockResolvedValue(
        memberRow({ id: 'm_target', role: 'admin', userId: 'u_target' }),
      );
      membershipFindUnique.mockResolvedValue({ id: 'm_self', role: 'owner' });

      const result = await inTenant(() => service.transferOwner('m_target', ACTOR_OWNER));

      expect(tenantUpdate).toHaveBeenCalledWith({
        where: { id: TENANT_ID },
        data: { ownerId: 'u_target' },
      });
      // 两次 membership.update：目标升 owner、原 owner 降 admin
      expect(membershipUpdate).toHaveBeenCalledWith({
        where: { id: 'm_target' },
        data: { role: 'owner' },
      });
      expect(membershipUpdate).toHaveBeenCalledWith({
        where: { id: 'm_self' },
        data: { role: 'admin' },
      });
      // 必须走事务数组形式，否则中途失败会出现「两个 owner」或「没有 owner」
      expect(transaction).toHaveBeenCalledWith(expect.any(Array));
      expect(result).toEqual({ tenantId: TENANT_ID, ownerId: 'u_target' });
    });

    it('目标已是 owner → 409 OWNER_TRANSFER_INVALID', async () => {
      membershipFindFirst.mockResolvedValue(
        memberRow({ id: 'm_owner2', role: 'owner', userId: 'u_owner2' }),
      );

      await expect(
        inTenant(() => service.transferOwner('m_owner2', ACTOR_OWNER)),
      ).rejects.toMatchObject({ status: 409 });
      expect(transaction).not.toHaveBeenCalled();
    });
  });
});
