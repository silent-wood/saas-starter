import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  AuthUser,
  ERROR_CODES,
  ForgotPasswordInput,
  ForgotPasswordResult,
  LoginInput,
  LoginResult,
  LogoutResult,
  MeResult,
  RegisterInput,
  RegisterResult,
  ResetPasswordInput,
  ResetPasswordResult,
  VerifyEmailResult,
} from '@saas/shared';
import bcrypt from 'bcrypt';
import { PRISMA } from '../../prisma/prisma.module.ts';
import type { ExtendedPrismaClient } from '../../prisma/prisma.service.ts';
import { TokenService } from './token.service.ts';
import { MailService } from '../../common/mail/mail.service.ts';
import { AuditService } from '../audit/audit.service.ts';
import { User } from '../../generated/prisma/client.ts';

/** bcrypt 成本因子：12 ≈ 单次哈希 200ms，离线爆破成本与登录延迟的平衡点 */
const BCRYPT_ROUNDS = 12;
/** 邮箱验证令牌有效期，与 MailService 文案里的 15 分钟保持一致 */
const VERIFY_TOKEN_TTL_MS = 15 * 60 * 1000;
/** 重置密码令牌有效期（30 分钟），与 MailService 文案里的 30 分钟保持一致 */
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

/** 登录结果 + 明文 refresh（refresh 由 controller 写 cookie，不进响应体） */
export interface LoginOutcome extends LoginResult {
  refreshToken: string;
}

/** 刷新结果 + 新的明文 refresh（轮转后必须换 cookie，否则下次刷新用的是已吊销的旧令牌） */
export interface RefreshOutcome {
  accessToken: string;
  refreshToken: string;
}

/**
 * 认证业务核心。所有登录注册逻辑都在这，Controller 只透传。
 *
 * 六条主流程：
 *  register    注册：只写 user + email_token，不建租户（租户等验证通过才建）
 *  verifyEmail 验证：事务内做四件事——消费令牌、置 verified、建租户、建 owner 成员
 *  login       登录：bcrypt 比对 + 签发双令牌（access 进响应体，refresh 进 httpOnly cookie）
 *  refresh     刷新：轮转——吊销旧 refresh，签发新的（防令牌被盗后长期复用）
 *  logout      登出：吊销 refresh，幂等
 *  me          查当前用户：由 JwtAuthGuard 验签后把 userId 传进来
 *
 * 贯穿全类的三条安全设计，改代码时不能破坏：
 *  1. 防用户枚举：账号不存在 / 密码错 / 被禁用，返回同一个 401「邮箱或密码不正确」，
 *     且耗时一致（不存在时拿 dummyHash 也跑一次 bcrypt）
 *  2. 令牌只存哈希：refresh / email token 落库都是 SHA-256，明文只出现在 cookie 或邮件链接
 *  3. 关键写入用事务 + 抢占式 updateMany（updateMany 返回 count，只有抢到的那次能继续），
 *     并发重放不会产生重复租户或双套令牌
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  /**
   * 防用户枚举的假哈希：账号不存在时也跑一次 bcrypt.compare，
   * 让「不存在」和「密码错误」耗时一致。不这么做的话，
   * 缺少 200ms 延迟本身就是「这个邮箱已注册」的信号。
   * 放在实例化时算一次，避免每次请求多付一次哈希成本。
   */
  private readonly dummyHash = bcrypt.hashSync('timing-equalizer-placeholder', BCRYPT_ROUNDS);

  constructor(
    // 注入带租户隔离扩展的 client。认证域的表（user/emailToken/refreshToken）都不在
    // 租户白名单里，扩展不会影响它们；统一注入 PRISMA 是为了全项目口径一致，
    // 避免「有的地方用扩展、有的地方用裸 client」。token 是 Symbol，必须显式 @Inject
    @Inject(PRISMA) private readonly prisma: ExtendedPrismaClient,
    private readonly tokenService: TokenService,
    private readonly mailService: MailService,
    // AuditModule 是 @Global 的，直接注入即可（登录审计见 login 方法注释）
    private readonly audit: AuditService,
  ) {}

  // -----------注册-------------------
  async register(input: RegisterInput): Promise<RegisterResult> {
    const email = this.normalizeEmail(input.email);
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing?.emailVerifiedAt) {
      // 必须显式带 code：不带的话 filter 会按 409 兜底成 CONFLICT，前端拿不到 EMAIL_TAKEN
      throw new ConflictException({
        code: ERROR_CODES.EMAIL_TAKEN,
        message: '该邮箱已注册，请直接登录',
      });
    }
    /**
     * 受邀注册只在「新建账号」分支尝试。
     *
     * 已存在但未验证的账号不走这条路：它可能是在别处正常注册过的（只是没点验证信），
     * 给它跳过建团队会让这个账号永远没有自己的团队——他手里这张邀请如果失效，
     * 就成了零团队账号，反而比普通注册更糟。文档 §2.5 的决策表也是这么定的。
     */
    const invite = existing ? null : await this.findAcceptableInvite(input.inviteToken, email);

    const token = this.tokenService.createOpaqueToken();
    const tokenData = {
      type: 'verify_email' as const,
      tokenHash: this.tokenService.hashToken(token),
      expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
      /**
       * 两种 payload 形态（方案 01 §4.2）：
       * - 普通注册 `{ tenantName }`：验证时建团队，名字挂在这里（注册当次不落库）
       * - 受邀注册 `{ skipTenant, inviteId }`：验证时不建团队，改为加入邀请的团队
       *
       * 为什么还留 `skipTenant`：它是意图标记，读 payload 时一眼看出「没有团队名
       * 不是漏写」。真正的执行依据是 `inviteId`——验证时会拿它**重查**邀请，
       * 不信任 15 分钟前的结论（期间管理员可能已撤销）。
       */
      payload: invite
        ? { skipTenant: true, inviteId: invite.id }
        : { tenantName: input.tenantName ?? '' },
    };

    let userId: string;

    if (existing) {
      // 未验证账号重复注册：覆盖密码与昵称、重发验证信，不返回 EMAIL_TAKEN。
      // 好处是用户忘了密码也能重来，且不会告诉攻击者「这个邮箱存在但没验证」
      userId = existing.id;
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: {
            passwordHash,
            nickname: input.name,
          },
        });

        // 旧令牌全部作废：否则此前几封邮件里面的链接都还能用，攻击面随重发次数线性增长
        await tx.emailToken.updateMany({
          where: { userId, type: 'verify_email', usedAt: null },
          data: { usedAt: new Date() },
        });
        await tx.emailToken.create({ data: { userId, ...tokenData } });
      });
    } else {
      // 新账号注册
      const created = await this.prisma
        .$transaction(async (tx) => {
          const user = await tx.user.create({
            data: { email, passwordHash, nickname: input.name },
          });
          await tx.emailToken.create({ data: { userId: user.id, ...tokenData } });
          return user;
        })
        .catch((err: unknown) => {
          // 并发注册同一邮箱时 findUnique 都查不到，靠 users.email 唯一索引兜底。
          // 不转码就会变成 500，前端只能显示「服务器错误」
          if (this.isUniqueViolation(err)) {
            throw new ConflictException({
              code: ERROR_CODES.EMAIL_TAKEN,
              message: '该邮箱已注册，请直接登录',
            });
          }
          throw err;
        });
      userId = created.id;
    }

    await this.mailService.sendVerifyEmail(email, token);
    return { userId, email };
  }

  // -----------邮箱验证-------------------

  /**
   * 消费验证令牌并产出「用户属于哪个团队」。
   *
   * 两条路径，终点一致（`email_verified_at` 置位 + 一条 `status=active` 的 membership）：
   * - **受邀注册**：payload 带 `inviteId`，加入邀请指向的团队，**不建租户**
   * - **普通注册 / 邀请已失效**：建一个自己的团队并成为 owner
   *
   * 邀请为什么在「验证」而不是「注册」时消费：注册阶段邮箱还没验证，而
   * `users.email` 的唯一键已经占住。邀请链接被转发到群里是常态，谁先拿到谁就能
   * 用这个邮箱注册；若注册即消费，攻击者占住邮箱、邀请变 accepted，他自己永远
   * 验证不了邮箱也登录不了，管理员却在成员列表看到「已接受」，真正的受邀人反而
   * 被挡在 410 外面。点开邮件里的验证链接 = 证明持有该邮箱，此时才是可信身份。
   */
  async verifyEmail(token: string): Promise<VerifyEmailResult> {
    const invalid = () =>
      new BadRequestException({
        code: ERROR_CODES.TOKEN_INVALID,
        message: '验证链接无效或已过期，请重新注册获取新链接',
      });

    const record = await this.prisma.emailToken.findFirst({
      where: { tokenHash: this.tokenService.hashToken(token), type: 'verify_email' },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) throw invalid();

    const payload = this.readPayload(record.payload);

    const tenantId = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.emailToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (consumed.count === 0) throw invalid();

      await tx.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: record.user.emailVerifiedAt ?? new Date() },
      });

      const now = new Date();

      if (payload.inviteId) {
        const invite = await tx.invite.findUnique({
          where: { id: payload.inviteId },
          select: {
            id: true,
            tenantId: true,
            email: true,
            role: true,
            status: true,
            expiresAt: true,
            invitedBy: true,
            tenant: { select: { deletedAt: true } },
          },
        });

        /**
         * 注册时校验过一次，这里**再验一次**：两件事之间可能隔了十几分钟，
         * 期间管理员可能撤销、团队可能被软删、邀请可能被重发轮换（重发不换 id，
         * 所以 id 还在但 token 已换——status 仍是 pending，属于可用）。
         * 邮箱再比一次是因为验证的是「这个邮箱的账号」，成本为零。
         */
        const usable =
          invite !== null &&
          invite.status === 'pending' &&
          invite.expiresAt.getTime() > now.getTime() &&
          invite.tenant.deletedAt === null &&
          invite.email.toLowerCase() === record.user.email.toLowerCase();

        if (invite && usable) {
          // upsert 而不是 create：同一人同租户只能有一行（@@unique(tenantId,userId)），
          // 这里可能是 removed 行（被移出后又通过邀请回来），直接改回 active
          await tx.membership.upsert({
            where: {
              tenantId_userId: { tenantId: invite.tenantId, userId: record.userId },
            },
            update: { status: 'active', role: invite.role },
            create: {
              tenantId: invite.tenantId,
              userId: record.userId,
              role: invite.role,
              status: 'active',
              invitedBy: invite.invitedBy,
              lastActiveAt: now,
            },
          });
          await tx.invite.update({
            where: { id: invite.id },
            data: { status: 'accepted', acceptedAt: now, acceptedBy: record.userId },
          });
          this.logger.log(`register.joined tenant=${invite.tenantId} user=${record.userId}`);
          return invite.tenantId;
        }

        // 邀请在注册之后失效（撤销 / 过期 / 团队被删）：落到下面的兜底团队。
        // 让用户「点了邀请链接却什么都没有」比多一个可改名的团队更难解释
        this.logger.warn(`register.invite-gone invite=${payload.inviteId} user=${record.userId}`);
      }

      const tenantName = payload.tenantName ?? `${record.user.nickname} 的团队`;
      const tenant = await tx.tenant.create({
        data: { name: tenantName, ownerId: record.userId },
      });

      await tx.membership.create({
        data: {
          tenantId: tenant.id,
          userId: record.userId,
          role: 'owner',
          status: 'active',
          lastActiveAt: now,
        },
      });
      return tenant.id;
    });
    return { verified: true, tenantId };
  }

  // ----------找回密码-------------------

  /**
   * 申请重置密码。
   *
   * 防枚举是本方法的第一要务：邮箱存在与否，响应体、状态码、耗时必须完全一致。
   *  - 存在：写一条 reset_password 令牌 + 发邮件
   *  - 不存在：什么都不做（不写库、不发信），但仍返回 { ok: true }
   *
   * 可重复申请：每次申请都【新增】一条 token，不覆盖旧 token。旧 token 在成功
   * 重置后会被 used_at 标记，天然失效；未重置前多次申请，最新的链接也能用。
   */
  async forgotPassword(input: ForgotPasswordInput): Promise<ForgotPasswordResult> {
    const email = this.normalizeEmail(input.email);
    const user = await this.prisma.user.findUnique({ where: { email } });

    // 邮箱不存在：静默成功，不泄露任何信息（见 AC-03）
    if (!user) return { ok: true };

    const token = this.tokenService.createOpaqueToken();
    // 令牌落库只存 SHA-256，明文只出现在邮件链接里。
    // payload 列是必填 Json（schema 未标 ?），但找回密码的令牌不需要挂业务数据，传空对象占位
    await this.prisma.emailToken.create({
      data: {
        userId: user.id,
        type: 'reset_password',
        tokenHash: this.tokenService.hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        payload: {},
      },
    });

    await this.mailService.sendResetPasswordEmail(email, token);
    return { ok: true };
  }

  /**
   * 用邮件链接里的 token 重置密码。
   *
   * 三件事必须【同一事务】完成，否则会出现「密码已改但旧会话还在」或
   * 「token 已消费但密码没改」的半吊子状态：
   *   1. 消费 token：updateMany 抢占式置 used_at（并发重放只有一次成功）
   *   2. 更新 users.password_hash（bcrypt cost=12）
   *   3. 吊销该用户【全部】refresh token（改密后所有设备下线，AC-08）
   */
  async resetPassword(input: ResetPasswordInput): Promise<ResetPasswordResult> {
    const invalid = () =>
      new BadRequestException({
        code: ERROR_CODES.TOKEN_INVALID,
        message: '链接无效或已过期，请重新获取',
      });

    const record = await this.prisma.emailToken.findFirst({
      where: { tokenHash: this.tokenService.hashToken(input.token), type: 'reset_password' },
    });

    // token 不存在 / 已使用 / 已过期，统一抛 TOKEN_INVALID（AC-05）
    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) throw invalid();

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    await this.prisma.$transaction(async (tx) => {
      // 抢占式消费：where 里带 usedAt:null，并发第二次会拿到 count=0，直接失败
      const consumed = await tx.emailToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (consumed.count === 0) throw invalid();

      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      });

      // 改密吊销全部 refresh：让所有已登录设备下次 refresh 都 401（他端下线）
      await tx.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    this.logger.log(`user.resetPassword success userId=${record.userId}`);
    return { ok: true };
  }

  // ----------登录----------------------
  /**
   * @param ip 调用方 IP，只用于登录审计的 `audit_logs.ip`。
   *   由 controller 从 `req.ip` 传进来 —— service 拿不到请求对象，
   *   也不该为了一个审计字段去依赖 HTTP 层。
   */
  async login(input: LoginInput, ip?: string | null): Promise<LoginOutcome> {
    const email = this.normalizeEmail(input.email);
    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    // 调试期打过明文密码，已移除：日志会进控制台、日志文件与采集端，
    // 属于凭据泄露（安全规范 §4 日志脱敏）。需要排查登录问题请用邮箱 + 结果码。
    const passwordMatches = await bcrypt.compare(
      input.password,
      user?.passwordHash ?? this.dummyHash,
    );
    if (!user || !passwordMatches) {
      throw new UnauthorizedException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: '邮箱或者密码不正确',
      });
    }

    if (user.status !== 'active') {
      // 与密码错误返回同一个码：区分开就等于告诉对方「这个账号是真的，只是被禁用」
      throw new UnauthorizedException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: '邮箱或密码不正确',
      });
    }

    // 「未验证」的判断必须放在密码比对之后：
    // 放在前面，不知道密码的人也能通过 400 得知「这个邮箱存在且未验证」
    if (!user.emailVerifiedAt) {
      throw new BadRequestException({
        code: ERROR_CODES.EMAIL_NOT_VERIFIED,
        message: '邮箱尚未验证，请先点击邮件中的链接',
      });
    }

    const refreshToken = this.tokenService.createOpaqueToken();
    const accessToken = await this.tokenService.signAccessToken(user.id);

    // 登录时间与 refresh 落库放同一事务，避免「签发成功但会话没记下来」
    // 那会导致用户拿到一个 15 分钟内有效、但永远无法刷新的 access token
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
      this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: this.tokenService.hashToken(refreshToken),
          expiresAt: this.tokenService.refreshExpiresAt(),
        },
      }),
    ]);
    this.logger.log(`user.login success userId=${user.id}`);

    // 登录审计走 service 而不是 @Audit 装饰器：`@Public()` 接口执行时
    // JwtAuthGuard 没有跑过，拦截器读到的 req.user 是 undefined（06 方案 §1.3 已预留此路径）。
    // 只记成功登录：actor_user_id 是 NOT NULL，失败登录没有 actor，
    // 且该接口有 5 次/15 分钟限流，记失败等于给自己加一条可被刷量的写路径。
    // void 不 await：审计是旁路，Neon 远程库一次 INSERT 5–20ms，不该拖慢登录响应。
    void this.audit.record({
      tenantId: null, // 账号级事件：登录发生在「选定租户之前」
      actorUserId: user.id,
      action: AUDIT_ACTIONS.AUTH_LOGIN,
      result: 'success',
      // INET 列不接受空串，req.ip 在部分代理配置下就是空串
      ip: ip || null,
      detail: { method: 'POST', path: '/auth/login' },
    });

    return { accessToken, refreshToken, user: this.toAuthUser(user) };
  }

  // --------------刷新----------------
  async refresh(rawRefreshToken: string): Promise<RefreshOutcome> {
    const invalid = () =>
      new UnauthorizedException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: '登录已失效，请重新登录',
      });
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.tokenService.hashToken(rawRefreshToken) },
    });
    if (!record || record.revokedAt || record.expiresAt.getTime() <= Date.now()) throw invalid();
    const nextToken = this.tokenService.createOpaqueToken();
    await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshToken.updateMany({
        where: { id: record.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      // 并发刷新（前端多个请求同时 401）：只有一个能抢到吊销权，另一个必须失败。
      // 都放行的话会签出两套新令牌，其中一个立刻变成「合法但已被换掉」的孤儿
      if (revoked.count === 0) throw invalid();
      await tx.refreshToken.create({
        data: {
          userId: record.userId,
          tokenHash: this.tokenService.hashToken(nextToken),
          expiresAt: this.tokenService.refreshExpiresAt(),
        },
      });
    });
    return {
      accessToken: await this.tokenService.signAccessToken(record.userId),
      refreshToken: nextToken,
    };
  }

  // ───────────── 登出 ─────────────

  async logout(rawRefreshToken?: string): Promise<LogoutResult> {
    // 幂等：没带 cookie / 已吊销 / 不存在，一律 200。
    // 前端不必区分「登出过」和「没登录过」，否则登出流程还要额外处理 401
    if (rawRefreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: {
          tokenHash: this.tokenService.hashToken(rawRefreshToken),
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    }
    return { ok: true };
  }

  // ───────────── 当前用户 ─────────────

  async me(userId: string): Promise<MeResult> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    // 令牌有效但用户已被删除 / 禁用：不能返回空对象，否则前端会渲染出半截界面
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: '账号不可用，请重新登录',
      });
    }
    return { user: this.toAuthUser(user) };
  }

  // -------- 内部工具方法 ----------------
  /** 存库前统一小写：否则 Admin@x.com 与 admin@x.com 会被当成两个账号 */
  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /** 库 → 契约的唯一映射点。契约叫 name、库里叫 nickname，只在这里翻译一次 */
  private toAuthUser(user: User): AuthUser {
    return {
      id: user.id,
      email: user.email,
      name: user.nickname,
      emailVerified: user.emailVerifiedAt !== null,
      avatarUrl: user.avatarUrl,
    };
  }

  /**
   * payload 是 Json 列，读出来是 unknown，必须自行收窄；直接当对象用会在脏数据上崩。
   *
   * 两种形态（方案 01 §4.2）统一解析成两个可空字段，调用方只按 null 分支，
   * 不需要知道原先是哪一种：
   * - 普通注册 `{ tenantName }`        → inviteId 为 null
   * - 受邀注册 `{ skipTenant, inviteId }` → tenantName 为 null
   */
  private readPayload(payload: unknown): { tenantName: string | null; inviteId: string | null } {
    if (typeof payload !== 'object' || payload === null) {
      return { tenantName: null, inviteId: null };
    }
    const source = payload as { tenantName?: unknown; inviteId?: unknown };
    return {
      // 空串等同缺失：让兜底团队名（`{nickname} 的团队`）接手，不会建出无名租户
      tenantName:
        typeof source.tenantName === 'string' && source.tenantName.trim()
          ? source.tenantName
          : null,
      inviteId: typeof source.inviteId === 'string' && source.inviteId ? source.inviteId : null,
    };
  }

  /**
   * 注册阶段的邀请校验，四项全中才返回邀请：**hash 命中 / 状态 pending / 未过期 / 邮箱一致**。
   *
   * 任一不满足都返回 null 而不是抛错——注册不该因为邀请过期而失败。用户没做错任何事，
   * 报错只会把他卡在注册页；静默降级成普通注册，唯一差别是验证时给他建一个自己的团队。
   * 这是方案 01 §2.5 决策表里「校验失败静默降级」那一条。
   *
   * 注意这里**只读取、不写入**：`invites.status` 要保持 pending，真正的消费在
   * `verifyEmail` 的事务里（见该方法的注释）。
   */
  private async findAcceptableInvite(
    rawToken: string | undefined,
    email: string,
  ): Promise<{ id: string } | null> {
    if (!rawToken) return null;

    const invite = await this.prisma.invite.findUnique({
      where: { tokenHash: this.tokenService.hashToken(rawToken) },
      select: {
        id: true,
        email: true,
        status: true,
        expiresAt: true,
        // 团队被软删后邀请不该再生效，否则用户会被拉进一个已进不去的团队
        tenant: { select: { deletedAt: true } },
      },
    });

    if (!invite) return null;
    if (invite.status !== 'pending') return null;
    if (invite.expiresAt.getTime() <= Date.now()) return null;
    // email 入库时已 trim + toLowerCase（MembersService.invite），这里 normalize 后再比
    if (invite.email.toLowerCase() !== email) return null;
    if (invite.tenant.deletedAt !== null) return null;

    return { id: invite.id };
  }
  /**
   * Prisma 的 P2002 = 唯一约束冲突。按结构判断而不是 instanceof：
   * 生成客户端的错误类路径随 Prisma 版本变化，结构判断更耐用
   */
  private isUniqueViolation(err: unknown) {
    return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
  }
}
