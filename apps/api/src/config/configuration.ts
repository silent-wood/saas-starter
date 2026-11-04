/**
 * 把扁平的环境变量整理成命名空间对象，供 ConfigService 按路径读取
 * （如 `config.get('jwt.accessTtlSeconds')`）。取值一律给默认，避免调用方处理 undefined。
 *
 * 注意：本工厂在 `envSchema` 校验之后执行，但 process.env 里仍是**字符串**原值
 * （schema 的 transform 只作用于校验结果），所以这里的布尔 / 数字转换要自己再做一次。
 */
export default () => ({
  // 当前运行环境：development / test / production。
  // 用于分支判断（cookie 是否加 Secure、错误 details 是否收敛、验证链接是否回显）
  nodeEnv: process.env.NODE_ENV ?? 'development',

  // HTTP 监听端口，数字型。main.ts 里 app.listen 用；默认与 env.schema 的 PORT 默认值一致
  port: Number(process.env.PORT ?? 3000),

  // 允许跨域的前端来源数组。原始值是逗号分隔字符串，这里切分并去掉空白项；
  // 默认值与 env.schema 的 CORS_ORIGINS 默认保持一致，否则空数组会拒绝一切跨域请求
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // 前端站点根地址。邮件里的验证 / 重置链接以它为前缀，指向前端而非 API；
  // 拼出的链接形如 `${appWebUrl}/verify-email?token=xxx`
  appWebUrl: process.env.APP_WEB_URL ?? 'http://localhost:5173',

  jwt: {
    // 签名密钥。env.schema 已保证长度 >= 32，这里的 '' 兜底只为满足类型；
    // 若真取到空串说明校验被绕过，签发会立刻报错而不是静默产出弱令牌
    secret: process.env.JWT_SECRET ?? '',
    // access token 有效期（秒），默认 900 = 15 分钟。
    // 传给 jwt.sign({ expiresIn })，因此必须是数字（字符串 "15m" 不在类型允许范围内）
    accessTtlSeconds: Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 900),
    // refresh token 有效期（天），默认 30 天。
    // 落库时用 now + 该天数算出 refresh_tokens.expires_at，同时作为 cookie maxAge
    refreshTtlDays: Number(process.env.REFRESH_TTL_DAYS ?? 30),
  },

  mail: {
    // Resend API Key。dev 模式下可以为空（不发信），非 dev 由 schema 强制要求
    apiKey: process.env.MAIL_API_KEY ?? '',
    // 发件人，格式 `显示名 <邮箱>`；域名需在 Resend 侧验证，否则发送返回 403/422
    from: process.env.MAIL_FROM ?? 'SaaS Starter <no-reply@example.com>',
    // true = 不发信，链接打日志 + 非生产回显响应。
    // 只认字面量 'true'：'false' / '1' / 未设置一律按关闭处理，交给 schema 去拦截非法取值
    devMode: process.env.MAIL_DEV_MODE === 'true',
  },
});
