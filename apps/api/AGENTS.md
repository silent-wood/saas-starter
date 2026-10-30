# AGENTS.md — apps/api

NestJS 12 后端（包名 `@saas/api`）。通用约定见仓库根 `AGENTS.md`。

## 命令（在仓库根目录执行）

- 开发：`pnpm --filter @saas/api dev`（watch 模式）
- 单测：`pnpm --filter @saas/api test` —— 测试框架是 **Vitest，不是 Jest**，不要写 Jest 专属 API
- e2e：`pnpm --filter @saas/api test:e2e`（配置 `vitest.config.e2e.ts`，用例在 `test/`）
- lint / 类型检查：`pnpm --filter @saas/api lint` / `pnpm --filter @saas/api typecheck`
- 只跑单个用例：`pnpm --filter @saas/api exec vitest run -t "<测试名>"`

## 结构与约定

- 入口 `src/main.ts`；模块组装在 `src/app.module.ts`
- **全局装配集中在 `src/setup-app.ts`**（前缀 `api/v1`、Zod 校验、统一响应 / 统一错误、安全头、CORS、Swagger）。`main.ts` 与 `test/` 下的 e2e 都调用它——**新增全局行为时改这个文件，不要在 main.ts 里单独加**
- 请求校验统一用 zod，schema 尽量与 `packages/shared` 共享；不引入 class-validator
- 引用共享类型：`import { ... } from "@saas/shared"`（走 shared 的构建产物 `dist/index.d.ts`；改 shared 后需先 `pnpm --filter @saas/shared build`）
- 相对导入一律带 `.js` 后缀（ESM / `moduleResolution: nodenext` 要求）

## 新增模块落点

以新增业务域 `billing` 为例：

1. 新建 `src/billing/`，内含 `billing.module.ts` + `billing.controller.ts` + `billing.service.ts` + 对应 `.spec.ts`，同目录放置
2. 在 `src/app.module.ts` 的 `imports` 中注册 `BillingModule`
3. DTO 与出入参类型若前后端共用，放 `packages/shared`，不要在本包重复定义
4. 接口级行为验证放 `test/`（e2e），单元逻辑放同目录 `.spec.ts`

## 测试

- 改动 service / controller 必须同步更新对应 `.spec.ts`；接口级行为验证放 e2e
- 提交前保证 `test` 与 `typecheck` 通过
