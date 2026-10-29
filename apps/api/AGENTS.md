# AGENTS.md — apps/api

NestJS 12 后端（包名 `api`）。通用约定见仓库根 `AGENTS.md`。

## 命令（在仓库根目录执行）

- 开发：`pnpm --filter api start:dev`（watch 模式）
- 单测：`pnpm --filter api test` —— 测试框架是 **Vitest，不是 Jest**，不要写 Jest 专属 API
- e2e：`pnpm --filter api test:e2e`（配置 `vitest.config.e2e.ts`，用例在 `test/`）
- lint / 类型检查：`pnpm --filter api lint` / `pnpm --filter api typecheck`
- 只跑单个用例：`pnpm --filter api exec vitest run -t "<测试名>"`

## 结构与约定

- 入口 `src/main.ts`；模块组装在 `src/app.module.ts`
- 请求校验统一用 zod，schema 尽量与 `packages/shared` 共享；不引入 class-validator
- 引用共享类型：`import { ... } from "@saas/shared"`（workspace 直连 `src/index.ts` 源码，无需先构建 shared）

## 新增模块落点

以新增业务域 `billing` 为例：

1. 新建 `src/billing/`，内含 `billing.module.ts` + `billing.controller.ts` + `billing.service.ts` + 对应 `.spec.ts`，同目录放置
2. 在 `src/app.module.ts` 的 `imports` 中注册 `BillingModule`
3. DTO 与出入参类型若前后端共用，放 `packages/shared`，不要在本包重复定义
4. 接口级行为验证放 `test/`（e2e），单元逻辑放同目录 `.spec.ts`

## 测试

- 改动 service / controller 必须同步更新对应 `.spec.ts`；接口级行为验证放 e2e
- 提交前保证 `test` 与 `typecheck` 通过
