# M2-01 认证链路（JWT 双令牌 / bcrypt / Guard）

> 知识分类：M2 认证与多租户 ｜ 关联里程碑：M2 ｜ 责任视角：后端 / 安全
> 状态：✅ 已落地（对应功能点 01-注册与登录、02-找回密码）

## 1. 这是什么

用户「你是谁、你是否登录」的整套验证机制，本项目已完整实现并冒烟通过。核心链路：

```
注册 → 写 user + 邮箱验证令牌（不建租户）
验证邮箱 → 事务内：消费令牌 + 置 verified + 建 tenant + 建 owner membership
登录 → bcrypt 比对 + 签发双令牌（access 进响应体，refresh 进 httpOnly cookie）
刷新 → 轮转：吊销旧 refresh + 签发新 refresh
登出 → 吊销 refresh（幂等）
```

## 2. 为什么值得学

- **招聘 JD 出现频率最高的后端硬技能**之一，几乎每个后端岗必问。
- 双令牌（access + refresh）是生产级标配，纯前端很少接触，是区分「会调接口」和「懂认证」的分水岭。
- 本项目的认证实现里有大量**安全细节**（防枚举、令牌只存哈希、抢占式消费、改密吊销全部），这些是面试能讲出深度的点。

## 3. 核心概念（含本项目真实取舍）

### 3.1 双令牌模型

| 令牌         | 存放位置        | 有效期  | 用途         | 载荷                      |
| ------------ | --------------- | ------- | ------------ | ------------------------- |
| accessToken  | 前端内存        | 15 分钟 | 每次请求携带 | `{ sub, type: 'access' }` |
| refreshToken | httpOnly cookie | 30 天   | 换新 access  | 服务端只存 SHA-256 哈希   |

**为什么 access 进内存、refresh 进 cookie**：access 要每次请求都带，放内存最灵活；refresh 要"换新 access 时自动带上"，放 httpOnly cookie（JS 读不到，XSS 偷不走）最安全。

**为什么 refresh 落库只存哈希**：refresh 是长效凭证，一旦库泄露，存明文等于全泄露；存 SHA-256 哈希，库被读走也无法冒用。

### 3.2 refresh 轮转（rotation）

刷新时**吊销旧 refresh + 签发新 refresh**，而不是"旧的一直有效"。这样即使旧 refresh 被盗，也只能用一次，下次刷新时新旧令牌竞争吊销权，只有一方存活。

```ts
// 抢占式吊销：where 带 revokedAt:null，并发刷新只有一个 count=1
const revoked = await tx.refreshToken.updateMany({
  where: { id: record.id, revokedAt: null },
  data: { revokedAt: new Date() },
});
if (revoked.count === 0) throw invalid(); // 抢不到 = 已被并发刷新换掉
```

### 3.3 防用户枚举（本项目贯穿全类的纪律）

攻击者最常干的事是"探测哪些邮箱注册过"。防御手段：

1. **响应一致**：账号不存在 / 密码错 / 被禁用，返回**同一个** 401「邮箱或密码不正确」。
2. **耗时一致**：账号不存在时也拿 `dummyHash` 跑一次 bcrypt，让两条路径耗时相同（缺少 200ms 延迟本身就是"这邮箱注册过"的信号）。
3. **状态判断顺序**：`emailVerifiedAt` 的判断放在密码比对**之后**，否则不知道密码的人也能通过 400 得知"这邮箱存在且未验证"。

### 3.4 bcrypt

密码绝不明文存，用 `bcrypt.hash(password, 12)` 存库。**cost=12** 是平衡点：单次哈希约 200ms，离线爆破成本足够高，登录延迟可接受。

## 4. 在本项目如何落地（真实代码）

### 4.1 全局守卫（`jwt-auth.guard.ts`）

```ts
@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1) 先看 @Public()，方法级压过类级
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // 2) 取 Bearer token，验签 + 验 exp
    const payload = await this.jwtService.verifyAsync<JwtPayload>(token);

    // 3) 类型校验：refresh 也用同段密钥签的，不查 type 就等于
    //    允许用 30 天的 refresh 长期假冒 access
    if (payload.type !== 'access' || !payload.sub) throw unauthorized();

    req.user = payload; // 守卫把 sub 挂上，controller 直接 req.user.sub
    return true;
  }
}
```

**关键设计**：

- 守卫**只验令牌、挂 payload**，不做租户校验——`/auth/me`、`/tenants` 不需要租户上下文，租户校验留给后续 TenantGuard（Step 7）。
- 注册为 `APP_GUARD`（走 DI 容器），**不是** `app.useGlobalGuards(new JwtAuthGuard())`——后者实例不经容器，构造依赖 `Reflector`/`JwtService` 是 undefined，一访问就 500。
- 区分 `TokenExpiredError`（过期，前端触发 refresh）和 `JsonWebTokenError`（签名错），靠 `err.name` 判断而非 `instanceof`（jsonwebtoken 是传递依赖，不直接 import）。

### 4.2 refresh token 走 cookie（`auth.controller.ts`）

```ts
res.cookie(REFRESH_COOKIE, token, {
  httpOnly: true, // JS 读不到
  sameSite: 'strict', // 跨站不带，CSRF 主防线
  secure: nodeEnv === 'production', // 本地 http 下不能开，否则浏览器丢弃 cookie
  path: '/api/v1/auth', // 只在 auth 路由发送，业务接口拿不到
  maxAge: refreshTtlDays * MS_PER_DAY,
});
```

### 4.3 邮件令牌（`token.service.ts`）

```ts
createOpaqueToken(): string { return randomBytes(32).toString('hex'); }  // 64 位 hex
hashToken(token): string { return createHash('sha256').update(token).digest('hex'); }
```

明文 token 只在生成那一刻和邮件链接里出现，落库全是哈希。**验证/重置时查库也查哈希，不查明文**——这也是为什么冒烟时无法从库反推 token，只能看 dev 日志。

## 5. 关键代码示例（改密吊销全部，来自 02-找回密码）

```ts
async resetPassword(input: ResetPasswordInput): Promise<ResetPasswordResult> {
  const record = await this.prisma.emailToken.findFirst({
    where: { tokenHash: this.tokenService.hashToken(input.token), type: 'reset_password' },
  });
  if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) throw invalid();

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  await this.prisma.$transaction(async (tx) => {
    // 消费令牌（抢占式，防重放）
    const consumed = await tx.emailToken.updateMany({
      where: { id: record.id, usedAt: null }, data: { usedAt: new Date() },
    });
    if (consumed.count === 0) throw invalid();
    // 改密
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    // 吊销该用户全部 refresh（他端下线）
    await tx.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() },
    });
  });
  return { ok: true };
}
```

**为什么三写必须同一事务**：否则会出现"密码改了但旧会话还在"或"token 已消费但密码没改"的半吊子状态。

## 6. 常见坑（本项目实际踩过的）

| 坑                                          | 后果                                       | 正确做法                                      |
| ------------------------------------------- | ------------------------------------------ | --------------------------------------------- | --- |
| access 和 refresh 用同一 secret 且不查 type | refresh 能长期冒充 access（权限越界）      | 载荷带 `type`，守卫强校验 `type==='access'`   |     |
| `invalid()` 箭头函数缺 `return`             | 异常永远抛不出去                           | 箭头函数返回异常对象必须写 `return`           |
| 校验 token 用明文查库                       | 查不到（库里是哈希）                       | 先 `hashToken(raw)` 再查                      |
| cookie 加了 `Secure` 但本地 http            | 浏览器丢弃 cookie，refresh 永远失败        | 按环境判断 `secure: nodeEnv==='production'`   |
| 防枚举忘了 dummyHash                        | 账号不存在时耗时短，泄露"这邮箱没注册"     | 不存在也跑一次 bcrypt                         |
| 改密不吊销 refresh                          | 旧会话还能继续访问（账号被盗后他端不下线） | 改密事务内 `refreshToken.updateMany` 批量吊销 |

## 7. 验收 / 自测清单

- [ ] 注册后库里密码是 bcrypt 哈希，非明文
- [ ] 无 token 访问受保护接口返回 401（`UNAUTHORIZED`）
- [ ] access 过期后 refresh 能无感换新（轮转）
- [ ] 旧 refresh 重放返回 401（轮转吊销）
- [ ] 账号不存在 / 密码错 / 被禁用返回同一个 401，耗时一致
- [ ] 改密后旧 refresh 全部失效（他端下线）
- [ ] 同一 token 二次使用返回 `TOKEN_INVALID`（防重放）

## 8. 延伸学习

- JWT RFC 7519、OAuth2 / OIDC 区别
- 为什么 access 进内存 + refresh 进 httpOnly cookie 是更安全组合
- 会话（session）vs 令牌（stateless JWT）的取舍场景
- 多设备管理：如何"踢掉某台设备"（按 refresh 记录粒度吊销）
