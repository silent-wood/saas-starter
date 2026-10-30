# AGENTS.md

## 项目概览

多租户中后台 SaaS 全栈脚手架（技术作品集 + 真实业务落地基座）。pnpm workspace + Turborepo monorepo。

- `apps/web` — 前端 SPA：Vite 8 · React 19 · Ant Design 6 · Zustand · TanStack Query · Tailwind 4（包名 `@saas/web`）
- `apps/api` — 后端：NestJS 12 · zod（包名 `@saas/api`）
- `packages/shared` — 前后端共享类型 / zod schema（包名 `@saas/shared`）
- `_docs/` — 需求、设计、规范文档（PM 视角产出）
- 里程碑路线图见根 `README.md`（当前处于 M1 阶段，按里程碑推进）

## 命令（在仓库根目录执行）

包管理器只用 pnpm（Node ≥ 20.19），禁止 npm / yarn。

- 全仓任务：`pnpm turbo run dev | build | lint | typecheck | test`
- 单包操作：`pnpm --filter <name> <script>`（`<name>` 取各包 `package.json` 的 `name` 字段，不是目录名），如 `pnpm --filter @saas/web dev`；装依赖同样加 filter：`pnpm --filter <name> add <pkg>`
- 类型检查是 `typecheck`（各包内部为 `tsc --noEmit`），不要用 build 代替
- `@saas/shared` 走**构建产物**：改 shared 后先 `pnpm --filter @saas/shared build`（或 `pnpm --filter @saas/shared dev` 开 watch），否则消费方拿到的是旧的 `dist/index.d.ts`

## 完成标准

一次改动视为完成，需同时满足：

1. `pnpm turbo run lint typecheck test` 全绿
2. 提交信息通过 commitlint（见下方规范），不允许 `--no-verify` 绕过钩子
3. 接口契约变更时，同步更新 `packages/shared` 的类型 / schema
4. 行为或约定变化涉及 `_docs/` 既有文档的，在提交说明中指出（文档本身只追加修订）

## 提交规范

- Conventional Commits，commit-msg 钩子强制校验（commitlint + simple-git-hooks）
- header ≤ 120 字符；scope 建议：`web` / `shared` / `api` / `docs` / `deps` / `repo`
- 示例：`feat(api): 租户注册接口`
- pre-commit 会跑 lint-staged（eslint + prettier），失败要修复

## 代码风格

- Prettier 统一：100 列 · 双引号 · 分号 · 尾逗号 all · LF（根 `.prettierrc.json`）
- TypeScript strict；避免 `any`，必须用时加注释说明原因
- 前后端共享的请求 / 响应类型与 zod schema 放 `packages/shared`，不要在 web / api 里重复定义
- 中文注释与提交说明均可，但标识符、分支名用英文

## 禁区与注意

- `.env*` 不入库；密钥只进 `.env`（`apps/api/.env.example` 是变量清单）
- 不要手改 `pnpm-lock.yaml`；装 / 升依赖后由 pnpm 自动更新
- `_docs/` 是 PM 产出文档，只追加修订，不改写既有结论；实现与文档冲突时以代码为准，并在提交说明中指出
- 生成物目录不要手工编辑，也不要提交：`dist/`、`node_modules/`、`.turbo/`、`coverage/`、`.vitest/`、`src/generated/`（api 的 Prisma 生成物）
- 各包更细的约定见其目录内的 AGENTS.md（就近优先）
