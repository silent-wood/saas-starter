# M2-04 数据建模（Prisma 关系 / 迁移 / seed）

> 知识分类：M2 认证与多租户 ｜ 关联里程碑：M2 ｜ 责任视角：后端 / DBA

## 1. 这是什么
用代码定义数据库表结构与表间关系（Prisma schema），用 **migration（迁移）** 管理 schema 演进，用 **seed（种子）** 造测试数据。是从「只会调接口」到「能设计数据」的关键跃迁。

## 2. 为什么值得学
- 关系建模（一对多 / 多对多）是后端基本功；写错关系后面全乱。
- migration 让你像管代码一样管数据库结构——团队协作不靠口头「你帮我加个字段」。
- 本项目所有表都带 `tenantId`（见 M2-03），建模时就定好。

## 3. 核心概念
- **schema.prisma**：声明 `model`（表）、字段类型、关系（`@relation`）、索引。
- **migration**：`prisma migrate dev` 生成 SQL 迁移文件并记录版本；上线用 `migrate deploy`。
- **seed**：脚本批量造假数据，方便本地联调与演示。
- **关系**：User 一对多 Tenant（owner）、Tenant 一对多 Resource、多对多 Member。

## 4. 在本项目如何落地
- 核心模型：Tenant、User、Membership（租户-用户关系+角色）、Resource、File、Subscription、AuditLog 等。
- 每个业务表显式加 `tenantId String` + 索引。
- 用 relation 表达 owner、成员、资源归属。

## 5. 关键代码示例
```prisma
model Tenant {
  id        String   @id @default(cuid())
  name      String
  members   Membership[]
  resources Resource[]
  createdAt DateTime @default(now())
}
model Resource {
  id        String @id @default(cuid())
  tenantId  String // 多租户隔离键
  title     String
  tenant    Tenant @relation(fields: [tenantId], references: [id])
  @@index([tenantId])
}
```

## 6. 常见坑
- 改了 schema 忘了 `migrate dev` → 本地能跑、上线结构不一致。
- migration 已应用到生产后还改历史文件 → 用新的 migration 而非改旧的。
- 生产用 `migrate dev`（会重置）是灾难 → 生产只用 `migrate deploy`。
- 索引缺失导致按 tenantId 查询全表扫 → 性能问题。

## 7. 验收 / 自测清单
- [ ] schema 定义完成核心模型与关系
- [ ] 每个业务表含 tenantId 且建索引
- [ ] `migrate dev` 生成迁移文件并入库
- [ ] seed 能造出可演示的多租户数据

## 8. 延伸学习
- Prisma 官方「Data Modeling」与「Relations」
- 数据库范式与反范式权衡
- 迁移策略：迁移 vs 同步（migrate vs db push）
