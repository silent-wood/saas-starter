import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import {
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
import { PrismaService } from '../../prisma/prisma.service.ts';
import { TokenService } from './token.service.ts';
import { MailService } from './mail.service.ts';
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
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly mailService: MailService,
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
    const token = this.tokenService.createOpaqueToken();
    const tokenData = {
      type: 'verify_email' as const,
      tokenHash: this.tokenService.hashToken(token),
      expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
      // 租户名只在注册请求里出现一次；验证时才建租户，所以必须先挂在令牌上
      payload: { tenantName: input.tenantName },
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

    const tenantName = this.readTenantName(record.payload) ?? `${record.user.nickname} 的团队`;
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

      const tenant = await tx.tenant.create({
        data: { name: tenantName, ownerId: record.userId },
      });

      await tx.membership.create({
        data: {
          tenantId: tenant.id,
          userId: record.userId,
          role: 'owner',
          status: 'active',
          lastActiveAt: new Date(),
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
  async login(input: LoginInput): Promise<LoginOutcome> {
    const email = this.normalizeEmail(input.email);
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    // 账号不存在时也拿假哈希跑一次对比，让两条路径耗时一致
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

  /** payload 是 Json 列，读出来是 unknown，必须自行收窄；直接当对象用会在脏数据上崩 */
  private readTenantName(payload: unknown): string | null {
    if (typeof payload !== 'object' || payload === null) return null;
    const value = (payload as { tenantName?: unknown }).tenantName;
    return typeof value === 'string' && value.trim() ? value : null;
  }
  /**
   * Prisma 的 P2002 = 唯一约束冲突。按结构判断而不是 instanceof：
   * 生成客户端的错误类路径随 Prisma 版本变化，结构判断更耐用
   */
  private isUniqueViolation(err: unknown) {
    return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
  }
}
