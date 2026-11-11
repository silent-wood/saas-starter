import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type AcceptInviteResult,
  type CreateInviteInput,
  type CreateInviteResult,
  ERROR_CODES,
  type InviteItem,
  type InvitePreview,
  type MemberItem,
  type MemberListResult,
  ROLE,
  type Role,
  type UpdateMemberRoleInput,
} from '@saas/shared';
import { PRISMA } from '../../prisma/prisma.module.ts';
import type { ExtendedPrismaClient } from '../../prisma/prisma.service.ts';
import { tenantContext } from '../../prisma/tenant.extension.ts';
import { MailService } from '../../common/mail/mail.service.ts';
import { TokenService } from '../auth/token.service.ts';

/** 邀请有效期 7 天。与 MailService 里文案的「7 天内有效」必须同步 */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** 操作人：只带路由守卫已确证的两件事，service 不再回头查一遍角色 */
export interface Actor {
  userId: string;
  /** TenantGuard 从 memberships 查出来的本租户角色 */
  role: Role;
}

/** 成员行 + 关联用户的查询列。抽出来是为了 list / 单个操作复用同一份投影 */
const MEMBER_SELECT = {
  id: true,
  userId: true,
  role: true,
  status: true,
  joinedAt: true,
  user: { select: { nickname: true, email: true, avatarUrl: true } },
} as const;

/** `MEMBER_SELECT` 的结果形状（Prisma 的推导类型太长，这里手写窄接口给映射函数用） */
interface MemberRow {
  id: string;
  userId: string;
  role: Role;
  status: string;
  joinedAt: Date;
  user: { nickname: string; email: string; avatarUrl: string | null };
}

/**
 * 成员与邀请的业务核心（05 方案）。
 *
 * 三条贯穿全类的纪律：
 *  1. `memberships` / `invites` **不在**租户扩展白名单里（守卫查 membership 时
 *     还没有租户上下文），所以每个方法都要显式 `tenantId` 过滤 —— 漏一处就是跨租户越权，
 *     而且查询不报错、只是多返回几行。统一走 `requireTenantId()`。
 *  2. 对象级规则（谁能改谁）在 service 判定，不塞进 `@Roles`：`@Roles` 只回答
 *     「admin/owner 能不能进这个接口」，判不了「目标是不是 owner」。
 *  3. 令牌只存 sha256，明文只在创建/重发的响应与邮件里出现一次（与 email_tokens 同纪律）。
 */
@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: ExtendedPrismaClient,
    private readonly mail: MailService,
    private readonly token: TokenService,
    private readonly config: ConfigService,
  ) {}

  // ───────────── 读 ─────────────

  /**
   * 成员页的两块数据。
   *
   * 一次取回而不是两个接口：同一屏渲染、同一个租户、没有独立分页的必要（AC-01）。
   * `removed` 显式排除 —— 那行只为留痕，出现在列表里就是幽灵成员。
   */
  async list(actor: Actor): Promise<MemberListResult> {
    const tenantId = this.requireTenantId();

    const [members, invites] = await Promise.all([
      this.prisma.membership.findMany({
        where: { tenantId, status: { in: ['active', 'disabled'] } },
        select: MEMBER_SELECT,
        // 枚举排序即声明顺序（owner → admin → member），owner 恒在首位；
        // 同角色内按加入时间正序，名单稳定不跳
        orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      }),
      this.prisma.invite.findMany({
        where: { tenantId, status: 'pending' },
        include: { inviter: { select: { nickname: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      members: members.map((row) => this.toMemberItem(row, actor.userId)),
      invites: invites.map((row) =>
        this.toInviteItem({ ...row, invitedByName: row.inviter.nickname }),
      ),
    };
  }

  // ───────────── 邀请 ─────────────

  /**
   * 创建邀请（或复用同邮箱的未过期邀请）。
   *
   * 「复用而不是新建」（AC-03）：同一 `(tenant, email)` 若已有 pending 行，就轮换
   * token 并顺延有效期。新建会让撤销/重发变得二义 —— 撤销了一条，另一条还能用。
   */
  async invite(input: CreateInviteInput, actor: Actor): Promise<CreateInviteResult> {
    const tenantId = this.requireTenantId();
    const email = input.email.trim().toLowerCase();

    const inviter = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { nickname: true, email: true },
    });
    if (!inviter) throw this.unauthorized();

    // 自己邀请自己没有意义，而且会在成员列表里出现两行同一个人的记录
    if (inviter.email === email) {
      throw this.conflict('不能邀请自己');
    }

    const target = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (target) {
      const existing = await this.prisma.membership.findUnique({
        where: { tenantId_userId: { tenantId, userId: target.id } },
        select: { status: true },
      });
      if (existing?.status === 'active') throw this.conflict('该邮箱已是团队成员');
      // 禁用是管理员动作，不能被一条新邀请绕过 —— 想要他回来请先启用
      if (existing?.status === 'disabled') {
        throw this.conflict('该成员已被禁用，请先在成员列表中启用');
      }
      // removed 放行：接受时复用原行改回 active（@@unique(tenantId,userId) 决定只能复用）
    }

    const { row, token } = await this.upsertPendingInvite({
      tenantId,
      email,
      role: input.role,
      actorUserId: actor.userId,
    });

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    const joinUrl = this.buildJoinUrl(token);

    // 邮件失败不抛（AC-17）：joinUrl 会随响应返回，管理员可以复制转发
    await this.mail.sendInviteEmail(email, {
      tenantName: tenant?.name ?? '团队',
      inviterName: inviter.nickname,
      joinUrl,
    });

    return { ...this.toInviteItem({ ...row, invitedByName: inviter.nickname }), joinUrl };
  }

  /** 重发：轮换 token + 重置 7 天，旧链接立即失效（AC-04） */
  async resendInvite(inviteId: string, actor: Actor): Promise<CreateInviteResult> {
    const tenantId = this.requireTenantId();
    const invite = await this.prisma.invite.findFirst({
      where: { id: inviteId, tenantId },
    });
    if (!invite) throw this.inviteGone();
    if (invite.status !== 'pending') throw this.conflict('该邀请已处理，不能重发');

    const { row, token } = await this.upsertPendingInvite({
      tenantId,
      email: invite.email,
      role: invite.role as Role,
      actorUserId: actor.userId,
      reuseId: invite.id,
    });

    const [tenant, inviter] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      this.prisma.user.findUnique({ where: { id: actor.userId }, select: { nickname: true } }),
    ]);
    const joinUrl = this.buildJoinUrl(token);

    await this.mail.sendInviteEmail(invite.email, {
      tenantName: tenant?.name ?? '团队',
      inviterName: inviter?.nickname ?? '管理员',
      joinUrl,
    });

    return {
      ...this.toInviteItem({ ...row, invitedByName: inviter?.nickname ?? '管理员' }),
      joinUrl,
    };
  }

  /** 撤销：pending → revoked，token 立即失效（AC-05） */
  async revokeInvite(inviteId: string, actor: Actor): Promise<{ id: string }> {
    const tenantId = this.requireTenantId();
    const invite = await this.prisma.invite.findFirst({ where: { id: inviteId, tenantId } });
    if (!invite) throw this.inviteGone();
    if (invite.status !== 'pending') throw this.conflict('该邀请已处理，不能撤销');

    await this.prisma.invite.update({
      where: { id: invite.id },
      // tokenHash 一并置成随机值，让「撤销后旧链接」连行都查不到，
      // 而不是依赖 status 判断（少一处可漏的分支）
      data: { status: 'revoked', tokenHash: this.token.hashToken(this.token.createOpaqueToken()) },
    });
    this.logger.log(`invite.revoke id=${invite.id} by=${actor.userId}`);
    return { id: invite.id };
  }

  /** 加入页预览（需登录）。已接受/已过期都返回 200，由前端给不同文案 */
  async previewInvite(token: string): Promise<InvitePreview> {
    const invite = await this.prisma.invite.findUnique({
      where: { tokenHash: this.token.hashToken(token) },
      include: {
        tenant: { select: { name: true, deletedAt: true } },
        inviter: { select: { nickname: true } },
      },
    });
    // 查不到 = token 被轮换/撤销，或纯属瞎猜。统一 410，不区分（可枚举性最低）
    if (!invite || invite.status === 'revoked' || invite.tenant.deletedAt) {
      throw this.inviteGone();
    }

    return {
      tenantName: invite.tenant.name,
      role: invite.role as 'admin' | 'member',
      inviterName: invite.inviter.nickname,
      email: invite.email,
      expired: invite.expiresAt.getTime() <= Date.now(),
      accepted: invite.status === 'accepted',
    };
  }

  /**
   * 接受邀请（`@SkipTenant`，调用时还没有该租户的上下文）。
   *
   * 全部校验都在事务外做完，事务里只写两条：membership upsert + invite 置 accepted。
   * 分开写会出现「邀请已消费、成员关系没建」——用户重开链接得到 410，团队里也查不到人。
   */
  async acceptInvite(token: string, actorUserId: string): Promise<AcceptInviteResult> {
    const invite = await this.prisma.invite.findUnique({
      where: { tokenHash: this.token.hashToken(token) },
      include: { tenant: { select: { id: true, name: true, deletedAt: true } } },
    });
    if (!invite || invite.status === 'revoked' || invite.tenant.deletedAt) {
      throw this.inviteGone();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { id: true, email: true },
    });
    if (!user) throw this.unauthorized();

    // 链接转发给别人用不了：邀请是发给具体邮箱的
    if (user.email !== invite.email) {
      throw this.conflict(`该邀请是发给 ${invite.email} 的，请用该邮箱登录后再接受`);
    }

    const membership = await this.prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId: invite.tenantId, userId: user.id } },
      select: { id: true, status: true },
    });

    // 幂等：已经接受了（或本来就是成员）就直接返回，重复点链接不该报错
    if (membership?.status === 'active') {
      return {
        id: invite.tenant.id,
        name: invite.tenant.name,
        role: invite.role as Role,
        status: 'active',
        lastActiveAt: null,
      };
    }
    if (membership?.status === 'disabled') {
      // 禁用必须管理员解除，邀请不能绕过
      throw this.conflict('你已被该团队禁用，请联系管理员启用后再加入');
    }
    if (invite.status === 'accepted') {
      // 邀请已消费但成员关系没了（被移除后又点了旧链接）—— 让管理员重发
      throw this.inviteGone();
    }
    if (invite.expiresAt.getTime() <= Date.now()) {
      throw this.inviteGone();
    }

    await this.prisma.$transaction([
      membership
        ? // removed 行复用：唯一约束决定同一用户在同租户只能有一行
          this.prisma.membership.update({
            where: { id: membership.id },
            data: { status: 'active', role: invite.role },
          })
        : this.prisma.membership.create({
            data: {
              tenantId: invite.tenantId,
              userId: user.id,
              role: invite.role,
              status: 'active',
              invitedBy: invite.invitedBy,
            },
          }),
      this.prisma.invite.update({
        where: { id: invite.id },
        data: { status: 'accepted', acceptedAt: new Date(), acceptedBy: user.id },
      }),
    ]);

    this.logger.log(`invite.accept tenant=${invite.tenantId} user=${user.id}`);

    return {
      id: invite.tenant.id,
      name: invite.tenant.name,
      role: invite.role as Role,
      status: 'active',
      lastActiveAt: null,
    };
  }

  // ───────────── 成员操作 ─────────────

  /** 改角色（AC-10）。角色未变化时幂等返回，不写库 */
  async updateRole(
    membershipId: string,
    input: UpdateMemberRoleInput,
    actor: Actor,
  ): Promise<MemberItem> {
    const target = await this.findMemberOrThrow(membershipId);
    this.assertOperable(actor, target, ERROR_CODES.OWNER_TRANSFER_INVALID);

    if (target.role === input.role) return this.toMemberItem(target, actor.userId);

    const updated = await this.prisma.membership.update({
      where: { id: target.id },
      data: { role: input.role },
      select: MEMBER_SELECT,
    });
    return this.toMemberItem(updated, actor.userId);
  }

  /** 禁用 / 启用（AC-11）。已是目标状态时幂等返回 */
  async setStatus(
    membershipId: string,
    status: 'active' | 'disabled',
    actor: Actor,
  ): Promise<MemberItem> {
    const target = await this.findMemberOrThrow(membershipId);
    this.assertOperable(actor, target, ERROR_CODES.MEMBER_STATE_INVALID);

    if (target.status === status) return this.toMemberItem(target, actor.userId);

    const updated = await this.prisma.membership.update({
      where: { id: target.id },
      data: { status },
      select: MEMBER_SELECT,
    });
    // 禁用后对方下一个请求就会被 tenant.guard 拦下（只认 active），无需令牌黑名单
    this.logger.log(`member.${status} id=${target.id} by=${actor.userId}`);
    return this.toMemberItem(updated, actor.userId);
  }

  /** 移除（AC-12）：只改状态不删行，留 `joinedAt` / `invitedBy` 供追溯 */
  async remove(membershipId: string, actor: Actor): Promise<{ id: string }> {
    const target = await this.findMemberOrThrow(membershipId);
    this.assertOperable(actor, target, ERROR_CODES.MEMBER_STATE_INVALID);

    if (target.status !== 'removed') {
      await this.prisma.membership.update({
        where: { id: target.id },
        data: { status: 'removed' },
      });
    }
    this.logger.log(`member.remove id=${target.id} by=${actor.userId}`);
    return { id: target.id };
  }

  /**
   * 转让所有权（AC-13）。
   *
   * 三条写入必须同事务：`tenants.ownerId` + 目标 `role=owner` + 原 owner `role=admin`。
   * 分开写中途失败会出现「两个 owner」（都能删租户）或「没有 owner」（团队失去转让起点）。
   */
  async transferOwner(
    membershipId: string,
    actor: Actor,
  ): Promise<{ tenantId: string; ownerId: string }> {
    const tenantId = this.requireTenantId();
    const target = await this.findMemberOrThrow(membershipId);

    if (target.userId === actor.userId) throw this.conflict('不能把所有权转让给自己');
    if (target.role === ROLE.owner) throw this.ownerTransferInvalid('该成员已是所有者');
    if (target.status !== 'active') throw this.ownerTransferInvalid('只能转让给有效成员');

    const actorMembership = await this.prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId: actor.userId } },
      select: { id: true, role: true },
    });
    // @Roles('owner') 已挡在前面，这里兜一层：租户里可能残留「owner_id 指向 A、
    // membership 里 A 已降级」的历史数据，只信 membership.role
    if (!actorMembership || actorMembership.role !== ROLE.owner) {
      throw new ForbiddenException({
        code: ERROR_CODES.ROLE_DENIED,
        message: '当前角色无权执行该操作',
      });
    }

    await this.prisma.$transaction([
      this.prisma.tenant.update({ where: { id: tenantId }, data: { ownerId: target.userId } }),
      this.prisma.membership.update({
        where: { id: target.id },
        data: { role: ROLE.owner },
      }),
      this.prisma.membership.update({
        where: { id: actorMembership.id },
        data: { role: ROLE.admin },
      }),
    ]);

    this.logger.log(`owner.transfer tenant=${tenantId} to=${target.userId} by=${actor.userId}`);
    return { tenantId, ownerId: target.userId };
  }

  // ───────────── 内部工具 ─────────────

  /**
   * 租户 id 只能从 AsyncLocalStorage 取。
   * 取不到说明调用链上缺 `TenantGuard`（或接口误标了 @SkipTenant），
   * 此时代码若继续跑就会拿不到 tenantId 而写出跨租户数据的查询 —— 直接 fail-closed。
   */
  private requireTenantId(): string {
    const tenantId = tenantContext.getStore()?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException({
        code: ERROR_CODES.TENANT_MISMATCH,
        message: '无权访问该租户，请重新选择',
      });
    }
    return tenantId;
  }

  /** 生成/轮换令牌并落库。返回行 + 明文 token（明文只用于拼 joinUrl 与发信） */
  private async upsertPendingInvite(params: {
    tenantId: string;
    email: string;
    role: Role;
    actorUserId: string;
    /** 重发时传已知邀请 id，跳过查重直接更新 */
    reuseId?: string;
  }): Promise<{ row: Omit<InviteRow, 'invitedByName'>; token: string }> {
    const token = this.token.createOpaqueToken();
    const data = {
      role: params.role as 'admin' | 'member',
      tokenHash: this.token.hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      invitedBy: params.actorUserId,
      status: 'pending' as const,
    };

    const reuseId =
      params.reuseId ??
      (
        await this.prisma.invite.findFirst({
          where: { tenantId: params.tenantId, email: params.email, status: 'pending' },
          select: { id: true },
        })
      )?.id;

    const row = reuseId
      ? await this.prisma.invite.update({ where: { id: reuseId }, data })
      : await this.prisma.invite.create({
          data: { ...data, tenantId: params.tenantId, email: params.email },
        });

    return { row, token };
  }

  private findMemberOrThrow(membershipId: string): Promise<MemberRow> {
    const tenantId = this.requireTenantId();
    return this.prisma.membership
      .findFirst({ where: { id: membershipId, tenantId }, select: MEMBER_SELECT })
      .then((row) => {
        // 别的租户的 membership id 一律 404：不暴露「这个 id 真的存在」
        if (!row) {
          throw new NotFoundException({
            code: ERROR_CODES.NOT_FOUND,
            message: '成员不存在或已被移除',
          });
        }
        return row as MemberRow;
      });
  }

  /**
   * 对象级操作规则（05 方案 §3.2 的表）。
   *
   * 顺序有讲究：
   *  1. 自己 → 409：owner 操作自己会撞「目标是 owner」，那个提示对用户是误导
   *  2. 目标是 owner → 按调用方给的码（改角色用 OWNER_TRANSFER_INVALID 引导去转让，
   *     禁用/移除用 MEMBER_STATE_INVALID，因为转让解决不了「我要禁掉他」）
   *  3. admin 操作 admin → 403：同级不能互降，否则两个 admin 可以互相锁死
   */
  private assertOperable(actor: Actor, target: MemberRow, ownerErrorCode: string): void {
    if (target.userId === actor.userId) throw this.conflict('不能对自己执行该操作');
    if (target.role === ROLE.owner) {
      throw new ConflictException({
        code: ownerErrorCode,
        message:
          ownerErrorCode === ERROR_CODES.OWNER_TRANSFER_INVALID
            ? '所有者角色只能通过转让变更'
            : '不能操作团队所有者，如需变更请先转让所有权',
      });
    }
    if (actor.role !== ROLE.owner && target.role === ROLE.admin) {
      throw new ForbiddenException({
        code: ERROR_CODES.ROLE_DENIED,
        message: '管理员只能操作普通成员',
      });
    }
  }

  private buildJoinUrl(token: string): string {
    return `${this.config.getOrThrow<string>('appWebUrl')}/join?token=${token}`;
  }

  private toMemberItem(row: MemberRow, actorUserId: string): MemberItem {
    return {
      id: row.id,
      userId: row.userId,
      nickname: row.user.nickname,
      email: row.user.email,
      avatarUrl: row.user.avatarUrl,
      role: row.role,
      // 列表查询已排除 removed，这里收窄类型给契约用
      status: row.status as 'active' | 'disabled',
      joinedAt: row.joinedAt.toISOString(),
      isSelf: row.userId === actorUserId,
    };
  }

  private toInviteItem(row: InviteRow): InviteItem {
    return {
      id: row.id,
      email: row.email,
      role: row.role as 'admin' | 'member',
      expired: row.expiresAt.getTime() <= Date.now(),
      expiresAt: row.expiresAt.toISOString(),
      invitedByName: row.invitedByName,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private conflict(message: string): ConflictException {
    return new ConflictException({ code: ERROR_CODES.MEMBER_STATE_INVALID, message });
  }

  private ownerTransferInvalid(message: string): ConflictException {
    return new ConflictException({ code: ERROR_CODES.OWNER_TRANSFER_INVALID, message });
  }

  /** 邀请失效统一 410：查不到 / 已撤销 / 已过期 / 已消费，前端只有一句「邀请已失效」 */
  private inviteGone(): GoneException {
    return new GoneException({
      code: ERROR_CODES.TOKEN_INVALID,
      message: '邀请已失效，请联系管理员重新发送',
    });
  }

  private unauthorized(): UnauthorizedException {
    return new UnauthorizedException({
      code: ERROR_CODES.UNAUTHORIZED,
      message: '登录已失效，请重新登录',
    });
  }
}

/** `invites` 行 + 邀请人昵称（list / 重发都要拼这个字段） */
interface InviteRow {
  id: string;
  email: string;
  role: string;
  expiresAt: Date;
  createdAt: Date;
  invitedByName: string;
}
