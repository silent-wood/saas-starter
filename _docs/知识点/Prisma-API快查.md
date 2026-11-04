# Prisma Client API 快查

> 用途：速查手册（非知识卡片）。写 Service 时对照这张表，快速回忆「某个操作该用哪个方法、参数怎么写」。
> 配套：`M2-05-PrismaClient与依赖注入`（讲注入机制）、`M2-04-数据建模Prisma`（讲 schema 建模）。

## 0. 命名规则速记

| 概念 | 规则 | 例子 |
|------|------|------|
| 模型属性 | `model` 名单数小写 | `model User` → `prisma.user` |
| 表名 | `@@map("...")` 指定 | `@@map("users")` |
| 字段名 | `@map("...")` 指定 | `passwordHash @map("password_hash")` |

**代码里一律用 model 名 + 字段名（camelCase），Prisma 自动翻译成表名 + 列名（snake_case）。**

## 1. 读操作

### findUnique —— 按唯一字段查一行
```ts
// where 只能用唯一字段（@id / @unique）
const u = await prisma.user.findUnique({ where: { email } });      // 返回 User | null
const t = await prisma.refreshToken.findUnique({
  where: { tokenHash: hashToken(raw) },                            // tokenHash 是 @unique
});
```
- 返回 `T | null`，查不到是 `null`，不是抛错。

### findFirst —— 按任意条件查第一条
```ts
// 非唯一字段、多条件组合用 findFirst（tokenHash 非唯一，需配合 type）
const token = await prisma.emailToken.findFirst({
  where: { tokenHash: hashToken(token), type: 'reset_password' },
  orderBy: { createdAt: 'desc' },                                  // 最新一条
});
```

### findMany —— 查多条
```ts
const memberships = await prisma.membership.findMany({
  where: { userId, status: 'active', tenant: { deletedAt: null } }, // 关系过滤 → JOIN
  include: { tenant: { select: { id: true, name: true } } },        // 只取需要的列
  orderBy: { lastActiveAt: 'desc' },                                // null 默认排最后
});
```
- `where` 条件间是 **AND**；用 `OR` / `NOT` 时写成 `where: { OR: [...] }`。
- `where: { tenant: { deletedAt: null } }` 是**关系过滤**，翻译成 JOIN 条件，不查整表。

## 2. 写操作

### create —— 插入一行
```ts
await prisma.emailToken.create({
  data: { userId, type: 'reset_password', tokenHash, expiresAt, payload: {} },
});
```

### update —— 按 where 定位一行并改
```ts
await prisma.user.update({
  where: { id: user.id },
  data: { lastLoginAt: new Date() },
});
```

### updateMany —— 批量更新（返回影响行数）
```ts
const result = await prisma.refreshToken.updateMany({
  where: { userId, revokedAt: null },   // 条件更新
  data: { revokedAt: new Date() },
});
result.count;                            // 影响了几行
```
- **抢占式消费的核心**：`where` 里带 `usedAt: null` / `revokedAt: null`，并发时只有一次 `count=1`。

### delete / deleteMany —— 删除（本项目暂未用，软删用 updateMany 置 deletedAt）

### upsert —— 有则更新、无则插入（本项目暂未用）

## 3. 事务 `$transaction`

保证多个写操作**原子**：要么全成功，要么全回滚。

### 回调式（推荐，用于有依赖/需判断结果的场景）
```ts
await prisma.$transaction(async (tx) => {
  const consumed = await tx.emailToken.updateMany({   // 必须用 tx.xxx
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (consumed.count === 0) throw invalid();          // 抢不到就回滚

  await tx.user.update({ where: { id }, data: { passwordHash } });
  await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
});
```

### 数组式（用于互不依赖的独立操作）
```ts
await prisma.$transaction([
  prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } }),
  prisma.refreshToken.create({ data: { ... } }),
]);
```

## 4. 关系查询速记

| 写法 | 作用 |
|------|------|
| `include: { tenant: true }` | 连带查出关联表（整行） |
| `include: { tenant: { select: { id: true, name: true } } }` | 只取关联表指定列 |
| `where: { tenant: { deletedAt: null } }` | 按关联表字段过滤（JOIN 下推） |
| `orderBy: { lastActiveAt: 'desc' }` | 排序；`desc` 对可空字段 null 排最后 |

## 5. 本项目模型 ↔ 属性 ↔ 表 对照

| model | 代码属性 | 表名 | 关键唯一/索引 |
|-------|---------|------|--------------|
| `User` | `prisma.user` | `users` | `email` @unique |
| `Tenant` | `prisma.tenant` | `tenants` | `@@index([ownerId])` |
| `Membership` | `prisma.membership` | `memberships` | `@@unique([tenantId, userId])`、`@@index([userId])` |
| `EmailToken` | `prisma.emailToken` | `email_tokens` | `@@index([tokenHash])`、`@@index([userId, type])` |
| `RefreshToken` | `prisma.refreshToken` | `refresh_tokens` | `tokenHash` @unique、`@@index([userId])` |
| `AiDocument` | `prisma.aiDocument` | `ai_documents` | `@@index([tenantId])` |
| `AiChunk` | `prisma.aiChunk` | `ai_chunks` | `@@index([tenantId, documentId])` |

## 6. 常见坑速查

| 坑 | 后果 | 正确做法 |
|----|------|---------|
| `where` 用了非唯一字段却调 `findUnique` | 编译报错 | 换 `findFirst` / `findMany` |
| 字段名拼错（如 `emial`） | 编译报错 | 以 schema 字段名为准 |
| 事务里用 `this.prisma` 而不是 `tx` | 部分操作不进事务 | 事务内一律 `tx.xxx` |
| 漏了必填字段（如 `payload`） | 编译报错 | 补上或用 `{}` 占位 |
| 查 token 用明文而不是哈希 | 查不到 | 先 `hashToken(raw)` 再查 |
| 改 schema 后忘了 `prisma generate` | 代码里没有新字段 | 重新 generate |
