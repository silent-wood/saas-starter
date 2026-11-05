import z from 'zod';

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

/**
 * 申请重置密码入参（`POST /auth/forgot-password`）。
 *
 * 只含 `email` 一个字段。**防枚举是本接口的第一要务**：无论邮箱是否存在，
 * 都返回 200 且响应体/耗时一致（见 §4.3），所以这里只校验邮箱格式，
 * 不关心它是否注册过——是否注册过是 service 的静默判断，不进 schema。
 */
export const forgotPasswordSchema = z.object({
  /** 用户填写的邮箱。后端会做 `trim + toLowerCase` 归一化后再查库，前端无需自己处理 */
  email: z.string().min(1, '请输入邮箱').email('邮箱格式不正确'),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/**
 * 重置密码入参（`POST /auth/reset-password`）。
 *
 * - `token`：来自邮件链接 `${APP_WEB_URL}/reset-password?token=xxx`，明文只出现在链接与请求体，
 *   库里只存 `sha256(token)`。**有意只校验非空**：令牌不存在/已用/已过期一律由 service
 *   抛 `TOKEN_INVALID`，若在此限制格式，短令牌会先被 422 拦下，与异常表口径不符。
 * - `password`：强度规则与 `registerSchema` 完全一致（8–64 位，含字母与数字），
 *   保证重置后的密码和注册时的强度约束同一套，不会出现"注册能过、重置不能过"的差异。
 */
export const resetPasswordSchema = z.object({
  /** 32 字节随机数的 hex（64 字符）；这里不校验格式，交给 service 查库判定 */
  token: z.string().min(1, '缺少重置令牌'),
  /** 新明文密码，bcrypt(cost=12) 落库为 password_hash */
  password: z
    .string()
    .min(8, '密码至少 8 位')
    .max(64, '密码不超过 64 位')
    .regex(/^(?=.*[A-Za-z])(?=.*\d)/, '密码需同时包含字母和数字'),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

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
 * `POST /auth/forgot-password` 成功响应（200）。
 *
 * 无论邮箱是否存在，响应都是这一个 `{ ok: true }`，**不携带任何能泄露账号状态的字段**。
 * 前端因此不能靠这个接口判断邮箱是否注册，只能统一提示「若该邮箱已注册，重置链接已发送」。
 */
export const forgotPasswordResultSchema = z.object({
  /** 恒为 true，仅表示请求已被处理（存在则已发信，不存在则静默） */
  ok: z.literal(true),
});

export type ForgotPasswordResult = z.infer<typeof forgotPasswordResultSchema>;

/**
 * `POST /auth/reset-password` 成功响应（200）。
 *
 * 走到这里说明三件事已在**同一事务**里完成：token 已消费（`used_at` 置位）、
 * 密码已改（`password_hash` 更新）、该用户全部 refresh token 已吊销。
 * 失败一律抛 `TOKEN_INVALID`（不存在/已用/已过期），不会走到这个成功体。
 */
export const resetPasswordResultSchema = z.object({
  /** 恒为 true，仅表示密码已成功重置 */
  ok: z.literal(true),
});

export type ResetPasswordResult = z.infer<typeof resetPasswordResultSchema>;
