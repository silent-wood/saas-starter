/**
 * 前后端契约唯一来源。
 *
 * 纪律（见根 AGENTS.md）：
 * - 请求 / 响应结构与 zod schema 只在这里定义，`apps/web` 与 `apps/api` 都从这里 import，
 *   禁止在两端各写一份副本（改一处漏一处必然导致联调时字段对不上）。
 * - 改这里之后必须 `pnpm --filter @saas/shared build`，否则消费方读到的还是旧 `dist/index.d.ts`。
 * - schema 同时承担运行时校验职责：后端 `StandardSchemaValidationPipe` 直接拿它校验请求体，
 *   前端 RHF 用 `zodResolver` 校验表单，两边规则因此天然一致。
 */
import { z } from 'zod';

export { ERROR_CODES } from './errors.js';

/**
 * 租户角色，与 Prisma `MemberRole` 枚举逐项对应（apps/api/prisma/schema.prisma）。
 *
 * - `owner`：租户所有者。可删除 / 恢复租户、转让所有权，一人一租户仅一条记录
 * - `admin`：管理员。可管理成员与租户配置，不能删除租户
 * - `member`：普通成员。仅业务数据读写
 *
 * 当前阶段只用于列表展示与粗粒度判断，按钮级权限校验在 `06-RBAC 与按钮级权限` 落地。
 */
export const ROLE = {
  owner: 'owner',
  admin: 'admin',
  member: 'member',
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];

/**
 * 成员关系状态，与 Prisma `MemberStatus` 枚举逐项对应。
 *
 * - `active`：正常成员，可访问该租户
 * - `disabled`：被管理员停用，仍占着成员位、可恢复（区别于 removed）
 * - `removed`：已移出租户，重新加入会新建一条记录
 *
 * `GET /tenants` 只返回 `active` 的租户，其余状态不进列表。
 */
export const MEMBER_STATUS = {
  active: 'active',
  disabled: 'disabled',
  removed: 'removed',
} as const;

export type MemberStatus = (typeof MEMBER_STATUS)[keyof typeof MEMBER_STATUS];

// ─────────────────────────────────────────────────────────────
// 入参契约（后端校验请求体 / 前端 zodResolver 校验表单）
// ─────────────────────────────────────────────────────────────

/**
 * 登录入参。
 *
 * 注意：这里的 `min(8)` 只用于挡住明显不合格的输入，**不承担"密码是否正确"的职责**。
 * 密码真正是否匹配由后端 bcrypt 比对决定；且账号不存在与密码错误必须返回完全一致的
 * 响应与耗时（防用户枚举），所以前端不能按错误码区分这两种情况。
 */
export const loginSchema = z.object({
  /** 登录邮箱。后端会做 `trim + toLowerCase` 归一化后再查库，前端无需自己处理 */
  email: z.string().min(1, '请输入邮箱').email('邮箱格式不正确'),
  /** 明文密码，仅用于本次请求传输；后端 bcrypt(cost=12) 比对，不落库 */
  password: z.string().min(1, '请输入密码').min(8, '密码至少 8 位'),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * 注册入参。
 *
 * 不含 `confirmPassword` —— 二次确认是纯前端表单关注点，由 web 侧
 * `registerSchema.extend({ confirmPassword })` 组合而来，不污染接口契约。
 *
 * 字段落库映射（详见 `_docs/功能技术方案/01-注册与登录.md` §4.2）：
 * - `tenantName`  → `tenants.name`（验证通过后建租户时写入，注册当次不落库）
 * - `name`        → `users.nickname`
 * - `email`       → `users.email`（唯一索引）
 * - `password`    → `users.password_hash`（bcrypt）
 */
export const registerSchema = z.object({
  /**
   * 团队名称，验证通过后成为租户名 `tenants.name`（字段上限 100，这里限 50 留余量）。
   * 命名不用 `companyName`：本产品是通用型多租户脚手架，租户 = 团队/组织，不限于企业。
   */
  tenantName: z.string().min(2, '团队名称至少 2 个字符').max(50, '团队名称不超过 50 个字符'),
  /** 用户显示名，写入 `users.nickname`（字段上限 50，这里限 20 便于列表与头像旁展示） */
  name: z.string().min(2, '姓名至少 2 个字符').max(20, '姓名不超过 20 个字符'),
  /** 注册邮箱，全局唯一。已注册且已验证时返回 `EMAIL_TAKEN`；未验证则覆盖密码并重发验证信 */
  email: z.string().min(1, '请输入邮箱').email('邮箱格式不正确'),
  /**
   * 明文密码。强度规则前后端共用这一条：
   * 8–64 位，且同时包含字母与数字（`max(64)` 防止超长字符串拖慢 bcrypt）
   */
  password: z
    .string()
    .min(8, '密码至少 8 位')
    .max(64, '密码不超过 64 位')
    // 前后端同一条强度规则，避免前端放行、后端拒绝
    .regex(/^(?=.*[A-Za-z])(?=.*\d)/, '密码需同时包含字母和数字'),
});

export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * 邮箱验证入参。`token` 来自邮件链接 `${APP_WEB_URL}/verify-email?token=xxx`，
 * 明文只存在于链接与请求体中，库里只存 `sha256(token)`。
 *
 * **有意只校验非空**：令牌不存在 / 已使用 / 已过期一律由 service 抛 `TOKEN_INVALID`。
 * 若在此处限制长度或字符集，短令牌会先被 422 `VALIDATION_FAILED` 拦下，
 * 与异常分支表的口径不符，前端也就无法据此区分"链接错了"和"字段没填"。
 */
export const verifyEmailSchema = z.object({
  /** 32 字节随机数的 hex（64 字符）；这里不校验格式，交给 service 查库判定 */
  token: z.string().min(1, '缺少验证令牌'),
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

// ─────────────────────────────────────────────────────────────
// 出参契约（前端 z.infer 复用，不在两端各写一份）
// ─────────────────────────────────────────────────────────────

/**
 * 当前登录用户。出现在 `POST /auth/login`、`GET /auth/me` 的响应体里。
 *
 * 刻意不含 `passwordHash` / `status` / `createdAt` 等内部字段：
 * 契约层只暴露前端需要用到的部分，避免"反正查出来了顺手带上"的泄露路径。
 */
export const authUserSchema = z.object({
  /** `users.id`（cuid）。与 JWT access 载荷里的 `sub` 一致 */
  id: z.string(),
  /** `users.email`。入库前已归一化为小写，前端可直接用于展示与比较 */
  email: z.string(),
  /** 显示名，取自 `users.nickname`（即注册时填的 name），2–20 字符 */
  name: z.string(),
  /** `users.email_verified_at` 非空即 true。未验证账号不允许登录，此处仅供 UI 展示验证状态 */
  emailVerified: z.boolean(),
  /** `users.avatar_url`。未设置时为 `null`（不是空字符串），前端用默认头像兜底 */
  avatarUrl: z.string().nullable(),
});

export type AuthUser = z.infer<typeof authUserSchema>;

/**
 * 租户列表项，用于 `GET /tenants`（独立接口，登录与 `/auth/me` 都不返回租户信息）。
 *
 * 之所以独立成接口：一个用户可属多个租户，把租户写进 access token 会导致
 * 切租户必须换令牌。现改为请求级传递——前端带 `X-Tenant-Id` 头，守卫校验
 * 该用户在此租户的 membership 存在且 `status=active`。
 */
export const tenantListItemSchema = z.object({
  /** `tenants.id`（cuid），切换租户时作为 `X-Tenant-Id` 的值 */
  id: z.string(),
  /** `tenants.name`，即注册时填的 `tenantName`；已软删租户不会出现在列表里 */
  name: z.string(),
  /** 当前用户在该租户内的角色，取自 `memberships.role` */
  role: z.enum([ROLE.owner, ROLE.admin, ROLE.member]),
  /** 成员关系状态，取自 `memberships.status`；列表只返回 `active`，其余状态用于后续成员管理页 */
  status: z.enum([MEMBER_STATUS.active, MEMBER_STATUS.disabled, MEMBER_STATUS.removed]),
  /** 最近一次在该租户内活跃时间（`memberships.last_active_at`），ISO 8601；从未活跃为 null */
  lastActiveAt: z.string().nullable(),
});

export type TenantListItem = z.infer<typeof tenantListItemSchema>;

/**
 * `POST /auth/register` 成功响应（201）。
 *
 * **注册成功不等于可登录**：此时 `email_verified_at` 为空、租户尚未创建，
 * 需用户点邮件链接走完 `verify-email` 才能登录。所以这里不返回 accessToken。
 */
export const registerResultSchema = z.object({
  /** 新建用户 id，前端无需使用，主要用于埋点与错误上报关联 */
  userId: z.string(),
  /** 归一化后的邮箱，前端据此提示"验证邮件已发送至 xxx" */
  email: z.string(),
});

export type RegisterResult = z.infer<typeof registerResultSchema>;

/**
 * `POST /auth/verify-email` 成功响应（200）。
 *
 * 该接口在**同一事务**里完成四写：`email_tokens.used_at`、`users.email_verified_at`、
 * `tenants`（新建）、`memberships`（新建 owner 记录）。任何一步失败整体回滚，
 * 避免出现"邮箱已验证但没有租户"的僵尸账号。
 */
export const verifyEmailResultSchema = z.object({
  /** 固定 true：走到这里说明令牌已消费成功（失败一律抛 TOKEN_INVALID） */
  verified: z.literal(true),
  /** 验证通过时新建的租户 id；前端可据此跳转并带上 `X-Tenant-Id` */
  tenantId: z.string(),
});

export type VerifyEmailResult = z.infer<typeof verifyEmailResultSchema>;

/**
 * `POST /auth/login` 成功响应（200）。
 *
 * refresh token **不在响应体里**：它通过 `Set-Cookie` 下发
 * （`HttpOnly` + `SameSite=Strict` + `Path=/api/v1/auth` + 30 天），
 * 前端 JS 读不到，只能靠 `withCredentials: true` 自动携带。
 * 因此前端只需保存 accessToken，且建议只存内存（刷新页面用 refresh 静默续期）。
 */
export const loginResultSchema = z.object({
  /** JWT access token，有效期 15 分钟；载荷只含 `{ sub, type: "access" }`，不含 tenantId */
  accessToken: z.string(),
  /** 当前用户信息，避免登录后立刻再发一次 `/auth/me` */
  user: authUserSchema,
});

export type LoginResult = z.infer<typeof loginResultSchema>;

/**
 * `POST /auth/refresh` 成功响应（200）。
 *
 * 刷新是**轮转式**的：旧 refresh token 立即吊销（`revoked_at` 置位）并换新 cookie，
 * 旧 token 重放会返回 401。前端遇到 401 只能走一次 refresh，且需做并发去重
 * （多个请求同时 401 时只发一次，否则会互相把对方刚换到的新 token 吊销）。
 */
export const refreshResultSchema = z.object({
  /** 新的 access token；refresh 由响应 cookie 自动更新，不在 body 里 */
  accessToken: z.string(),
});

export type RefreshResult = z.infer<typeof refreshResultSchema>;

/**
 * `POST /auth/logout` 成功响应（200）。
 *
 * 服务端把当前 refresh token 行的 `revoked_at` 置位并清 cookie。接口本身幂等：
 * 无 cookie 或已吊销也返回 200，前端不必区分"登出过"和"没登录过"。
 */
export const logoutResultSchema = z.object({
  /** 恒为 true，仅表示请求已被处理 */
  ok: z.literal(true),
});

export type LogoutResult = z.infer<typeof logoutResultSchema>;

/**
 * `GET /auth/me` 成功响应（200）。需带 access token。
 *
 * 它是验证 `JwtAuthGuard` 真的生效的最小闭环：守卫失效时这个接口不会报 401，
 * 能第一时间暴露"所有接口裸奔"的问题。
 */
export const meResultSchema = z.object({
  /** 当前登录用户；租户信息不在这里，走 `GET /tenants` */
  user: authUserSchema,
});

export type MeResult = z.infer<typeof meResultSchema>;

/**
 * `GET /tenants` 成功响应（200）。需带 access token。
 *
 * 只返回 `memberships.status = active` 且租户未软删（`tenants.deleted_at` 为空）的记录，
 * 按 `lastActiveAt` 降序、空值排最后。列表为空是合法状态（理论上注册即建租户，
 * 但成员被移出后会出现空列表），前端需处理空态而不是当成错误。
 */
export const tenantListResultSchema = z.object({
  /** 按 `lastActiveAt` 降序排列；数组可能为空 */
  items: z.array(tenantListItemSchema),
});

export type TenantListResult = z.infer<typeof tenantListResultSchema>;

// ─────────────────────────────────────────────────────────────
// 统一响应包裹（与后端 TransformInterceptor / HttpExceptionFilter 一致）
// ─────────────────────────────────────────────────────────────

/**
 * 成功响应包裹，由后端 `TransformInterceptor` 统一套上，接口实现里不要自己拼。
 * 形如 `{ success: true, data, message: "OK", timestamp: 1730000000000 }`。
 */
export interface ApiSuccess<T> {
  /** 恒为 true；判断成败用它，不要用 HTTP 状态码 */
  success: true;
  /** 业务数据，结构与上面各 `*Result` schema 对应 */
  data: T;
  /** 提示语，成功时通常为 `OK` */
  message: string;
  /** 服务端时间戳（毫秒），用于排查时对齐日志 */
  timestamp: number;
}

/**
 * 失败响应包裹，由后端 `HttpExceptionFilter` 统一产出。
 * 形如 `{ success: false, error: { code, message, details }, timestamp }`。
 *
 * 前端取错误码的**正确路径是 `response.data.error.code`**，不是 `response.data.code`
 * —— 后者永远取不到，是联调期最常见的"所有错误都显示未知错误"的原因。
 */
export interface ApiFailure {
  /** 恒为 false */
  success: false;
  error: {
    /** 业务错误码，取值见 `ERROR_CODES`（如 `EMAIL_TAKEN` / `TOKEN_INVALID`） */
    code: string;
    /** 面向用户的可读消息，前端可直接展示，也可按 code 换成自己的文案 */
    message: string;
    /** 附加信息：字段校验错误时是逐字段的错误列表；生产环境不透出 */
    details?: unknown;
  };
}
