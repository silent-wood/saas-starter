import { z } from 'zod';

/**
 * 环境变量契约。启动即校验：缺键或类型不符直接抛错退出，
 * 而不是拖到运行到一半才因为 `undefined` 崩掉（例如 JWT_SECRET 为空会签出可伪造的令牌）。
 *
 * 新增变量时必须同时改三处：本文件、`.env.example`、`configuration.ts`。
 */

/**
 * 布尔值不能直接用 `z.coerce.boolean()`：`Boolean("false") === true`，
 * 环境变量里写 `MAIL_DEV_MODE=false` 反而会开启。这里限定字面量再转换。
 */
const booleanFromEnv = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

export const envSchema = z
  .object({
    // ── 运行时 ──
    // 运行环境。test 供 e2e 使用；生产 / 开发的分支差异（cookie Secure、错误详情是否透出、
    // MAIL_DEV_MODE 回显）都以它为准，不另外读其它开关
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    // HTTP 监听端口。本地 3000；e2e 应换成随机端口，避免与正在 dev 的实例抢端口导致启动失败
    PORT: z.coerce.number().int().positive().default(3000),
    // 运行时连接串，指向 Neon 的池化地址（主机名带 -pooler）。PrismaClient 全程只用它
    DATABASE_URL: z.url(),
    // 迁移专用直连地址（绕开 Neon PgBouncer 池化）；命名与 Prisma 官方 directUrl 惯例一致。
    // 只有 prisma migrate / db push 这类 DDL 需要它，运行时缺失不报错，故为 optional
    DIRECT_URL: z.url().optional(),

    // ── 认证 ──
    // access token 的签名密钥，至少 32 位（openssl rand -base64 48）。长度不足直接拒绝启动：
    // 短密钥可被暴力穷举，等于任何人都能自签合法令牌
    JWT_SECRET: z.string().min(32),
    // access token 有效期（秒），默认 900 = 15 分钟。用数字而非 "15m" / "30d"：
    // jsonwebtoken 的 expiresIn 期望 StringValue 联合类型，z.string() 推断出的宽 string 与之不兼容
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    // refresh token 有效期（天），默认 30 天。与 JWT_ACCESS_TTL_SECONDS 分开命名，
    // 避免两个单位混在同一个键里；轮转时旧令牌立即吊销，这个值只决定新令牌的寿命
    REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),

    // ── 跨域 ──
    // 允许的前端来源，多个用英文逗号分隔。由 configuration.ts 切成数组后交给 enableCors；
    // 默认值与配置工厂保持一致，否则默认值不匹配会让本地联调直接全被 CORS 拦下
    CORS_ORIGINS: z.string().default('http://localhost:5173'),

    // ── 邮件 ──
    // 前端站点根地址。邮件里的验证 / 重置链接指向它而不是 API：
    // ${APP_WEB_URL}/verify-email?token=xxx，因此必须是可被收件人访问的地址，不能填 127.0.0.1
    APP_WEB_URL: z.url().default('http://localhost:5173'),
    // 开发环境开关：true 时不实际发信，链接打到日志并（非生产）回显到响应 details.verifyUrl。
    // Resend 未验证域名时只能发到账号本人邮箱，本地联调必须靠它
    MAIL_DEV_MODE: booleanFromEnv,
    // Resend API Key（re_ 开头）。这里声明为 optional，是因为 dev 模式下不需要它；
    // 真正的「非 dev 必须有」由下方 superRefine 条件校验，不写在这里以免 dev 启动被卡
    MAIL_API_KEY: z.string().optional(),
    // 发件人显示名 + 地址，格式 `名称 <邮箱>`。域名必须在 Resend 完成验证，否则发送会被拒
    MAIL_FROM: z.string().default('SaaS Starter <no-reply@example.com>'),

    // ── 预留（当前未接入，缺失不影响启动）──
    // Redis 连接串，M3 用于限流计数、令牌黑名单与队列
    REDIS_URL: z.url().optional(),
    // 腾讯云 COS 访问端点，M4 用于文档原件存储
    COS_ENDPOINT: z.url().optional(),
    // 腾讯云 COS 存储桶名，与 COS_ENDPOINT 配套
    COS_BUCKET: z.string().optional(),
    // SMTP 主机，作为 Resend 之外的备用发信通道
    SMTP_HOST: z.string().optional(),
    // 大模型调用密钥，M4 用于 RAG 问答与向量化
    LLM_API_KEY: z.string().optional(),
  })
  // 依赖校验：只要不是 dev 模式就必须有真实发信能力，否则注册流程会卡在发信环节
  .superRefine((env, ctx) => {
    if (!env.MAIL_DEV_MODE && !env.MAIL_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['MAIL_API_KEY'],
        message: 'MAIL_DEV_MODE 未开启时必须提供 MAIL_API_KEY',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;
