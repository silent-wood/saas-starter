# M2-01 认证链路（JWT 双令牌 / bcrypt / Guard）

> 知识分类：M2 认证与多租户 ｜ 关联里程碑：M2 ｜ 责任视角：后端 / 安全

## 1. 这是什么
用户「你是谁、你是否登录」的整套验证机制：注册时密码哈希存储；登录时校验并签发 **JWT（JSON Web Token）**；之后每次请求携带令牌，后端用 Guard 拦截校验。

## 2. 为什么值得学
- **招聘 JD 出现频率最高的后端硬技能**之一，几乎每个后端岗必问。
- 它把「会话（session）」从服务端存储变成「无状态令牌」，是理解现代 API 认证的基础。
- 双令牌（access + refresh）设计是生产级的标配，纯前端很少接触。

## 3. 核心概念
- **JWT**：带签名的可读令牌，服务端用密钥验签，无需查库即可信任「这是某某用户」。
- **双令牌**：`accessToken`（短效，如 15min，进每个请求）、`refreshToken`（长效，如 7d，仅用于换新 access）。被盗时影响面受限。
- **bcrypt**：把密码哈希存储（加盐），即使库泄露也难反推明文；**绝不明文存密码**。
- **Guard**：NestJS 的路由守卫，在 Controller 之前校验令牌，未登录直接 401。

## 4. 在本项目如何落地
- 注册：`bcrypt.hash(password, 10)` 存库。
- 登录：校验密码 → 签发双令牌 → 返回前端。
- 请求：`@UseGuards(JwtAuthGuard)` + `Authorization: Bearer <accessToken>`。
- refresh：前端检测 401 → 用 refresh 换新的 access（无感刷新）。

## 5. 关键代码示例
```ts
// 登录签发（伪代码）
const token = this.jwt.sign({ sub: user.id, tenantId: user.tenantId },
  { secret: process.env.JWT_SECRET, expiresIn: '15m' });
const refresh = this.jwt.sign({ sub: user.id }, { secret: process.env.JWT_REFRESH_SECRET, expiresIn: '7d' });
```

## 6. 常见坑
- 用同一个 secret 签 access 和 refresh，导致 refresh 也能当 access 用（权限越界）。
- access 过期处理不当导致频繁跳登录 → 必须有 refresh 无感续期。
- 把 JWT 存 `localStorage` 有 XSS 风险；权衡：`httpOnly` Cookie 更安全但需处理 CSRF。
- 不校验令牌过期 / 不处理用户登出（stateless 下登出需黑名单或短时效）。

## 7. 验收 / 自测清单
- [ ] 注册后库里密码是哈希，非明文
- [ ] 无令牌访问受保护接口返回 401
- [ ] access 过期后 refresh 能无感换新
- [ ] 双令牌使用不同 secret

## 8. 延伸学习
- JWT RFC 7519、OAuth2 / OIDC 区别
- 为什么需要 refresh token（文章很多）
- 会话 vs 令牌的取舍场景
