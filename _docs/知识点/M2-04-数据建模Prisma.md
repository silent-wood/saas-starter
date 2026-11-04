# M2-04 数据建模（Prisma 关系 / 迁移 / seed）

> 知识分类：M2 认证与多租户 ｜ 关联里程碑：M2 ｜ 责任视角：后端 / DBA
> 状态：✅ 已落地（schema 已建 User/Tenant/Membership/EmailToken/RefreshToken 及 AI 域表）

## 1. 这是什么

用 `schema.prisma` 定义数据库表结构、表间关系、索引与约束，用 migration 管理结构演进。是从「只会调接口」到「能设计数据」的关键跃迁。

本项目的 schema 已落地 7 张表：`User`、`Tenant`、`Membership`、`EmailToken`、`RefreshToken`、`AiDocument`、`AiChunk`，覆盖认证域 + 多租户域 + AI 域。

## 2. 为什么值得学

- 关系建模（一对多 / 多对多）是后端基本功，写错关系后面全乱。
- migration 让你像管代码一样管数据库结构——团队协作不靠口头"帮我加个字段"。
- 多租户 SaaS 的数据建模有其特殊性（tenantId 贯穿、软删、级联边界），这是通用教程很少讲、但实战极其关键的。

## 3. 核心概念

### 3.1 三层命名映射（本项目实际用到的关键设计）

Prisma 里一个"字段"有**三层名字**，靠 `@map` / `@@map` 解耦：

| 层级 | 用什么 | 例子 |
|------|--------|------|
| 代码层（model 名、字段名） | camelCase / PascalCase 单数 | `model User`、`passwordHash` |
| 数据库层（表名、列名） | snake_case / 复数 | `@@map("users")`、`@map("password_hash")` |

**为什么解耦**：让代码层保持 Prisma/TS 惯例（`prisma.user.passwordHash`），数据库层保持 PostgreSQL 惯例（`users.password_hash`），两边都能维持各自习惯。

### 3.2 字段级 `@` 与模型级 `@@`

- **`@`（字段级）**：写在某字段行，管单个列。本项目用到的：`@id`（主键）、`@unique`（唯一）、`@default(now())`、`@updatedAt`、`@map("...")`（列名）、`@db.VarChar(100)`（原生类型）、`@relation`（关联）。
- **`@@`（模型级）**：写在 model 末尾，管整表或字段组合。本项目用到三种：
  - `@@map("users")`：指定真实表名
  - `@@index([ownerId])`：普通索引（可复合，如 `@@index([tenantId, documentId])`）
  - `@@unique([tenantId, userId])`：复合唯一约束

### 3.3 关系建模（本项目 tenant/membership 的范式）

```
User 1 ── N Membership N ── 1 Tenant
```

- `Tenant.ownerId` → 一对多（`@relation("TenantOwner")`，显式命名避免歧义）
- `Membership` 是 `User` 和 `Tenant` 的**中间表**，承载 `role`（RBAC）和 `status`（成员状态）
- `@@unique([tenantId, userId])` 保证**一人一租户只有一条成员记录**

### 3.4 软删除（soft delete）

`Tenant.deletedAt`（可空 DateTime）：删除时置时间戳而非物理删行，进回收站可恢复。**列表查询必须过滤 `deletedAt: null`**，否则已删数据混进正常列表。

### 3.5 级联边界（建模纪律）

`onDelete: Cascade` **只用于同域内外键**：删租户连带删成员关系是合理的（同属租户域）。跨域外键一律不级联，防误删扩散。

## 4. 在本项目如何落地（真实 schema）

```prisma
model User {
  id              String       @id @default(cuid())
  email           String       @unique
  passwordHash    String       @map("password_hash") @db.VarChar(100)  // bcrypt 60 字符留余量
  nickname        String       @db.VarChar(50)
  emailVerifiedAt DateTime?    @map("email_verified_at")  // 空 = 未验证
  status          UserStatus   @default(active)
  createdAt       DateTime     @default(now()) @map("created_at")
  updatedAt       DateTime     @updatedAt @map("updated_at")  // 由 Prisma 维护

  memberships     Membership[]
  ownedTenants    Tenant[]     @relation("TenantOwner")
  @@map("users")
}

model Membership {
  id           String       @id @default(cuid())
  tenantId     String       @map("tenant_id")
  userId       String       @map("user_id")
  role         MemberRole   @default(member)
  status       MemberStatus @default(active)
  lastActiveAt DateTime?    @map("last_active_at")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([tenantId, userId])   // 一人一租户一条记录
  @@index([userId])              // 反查"用户加入的所有租户"
  @@map("memberships")
}
```

**几个设计决策的由来**：
- `passwordHash @db.VarChar(100)`：bcrypt 产 60 字符，留余量应对算法升级。
- `Membership` 单独建表而非 `User` 挂 `tenantId`：一个用户可属多租户，必须用中间表。
- `lastActiveAt` 放 Membership 而非 Tenant：它是"某用户在某租户"的活跃度，属成员关系维度。

## 5. 关键代码示例（查询层配合建模）

```ts
// 过滤下推：租户列表查 active 成员 + 未软删租户
const memberships = await prisma.membership.findMany({
  where: {
    userId,
    status: 'active',
    tenant: { deletedAt: null },        // 关系过滤 → JOIN 条件
  },
  include: { tenant: { select: { id: true, name: true } } },  // 只取需要的列
  orderBy: { lastActiveAt: 'desc' },
});
```

建模纪律：**过滤下推到 SQL**（`where.tenant.deletedAt` 翻译成 JOIN 条件），而不是查回来再 filter——后者会多读已删/禁用行。

## 6. 常见坑（本项目实际踩过的）

| 坑 | 后果 | 正确做法 |
|----|------|---------|
| 改了 schema 忘了 `prisma generate` | 代码里没有新字段，typecheck 报错 | 改完 schema 先 generate |
| `payload` 列是必填 `Json` 却漏传 | typecheck 报"payload missing" | 显式传 `{}` 占位（找回密码令牌不挂数据） |
| 生产用 `migrate dev`（会重置） | 灾难 | 生产只用 `migrate deploy` |
| 迁移已应用后改历史文件 | 各环境结构不一致 | 用新 migration，不改旧的 |
| 查询忘过滤 `deletedAt: null` | 软删数据混进正常列表 | 列表查询一律带软删过滤 |
| 索引缺失（如按 tenantId 查） | 全表扫描，性能问题 | 每个业务表 tenantId 建索引 |
| 跨域外键也 `Cascade` | 误删扩散 | 跨域不级联 |

## 7. 验收 / 自测清单

- [ ] 每个业务表显式带 tenantId + 索引（多租户隔离前提）
- [ ] 关系用 `@relation` 表达，中间表（Membership）有复合唯一约束
- [ ] 软删字段（deletedAt）+ 列表查询过滤
- [ ] `@map`/`@@map` 命名解耦，代码 camelCase、库 snake_case
- [ ] 改 schema 后 `migrate dev` 生成迁移并入库

## 8. 延伸学习

- Prisma 官方「Data Modeling」「Relations」「Indexes」
- 数据库范式与反范式权衡
- 迁移策略：migrate vs db push 的适用场景
- 多租户建模三方案：独立库 / 独立 schema / 共享表 + tenantId 行级隔离（本项目用第三种，见 M2-03）
