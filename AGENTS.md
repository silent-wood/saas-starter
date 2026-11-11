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
- `@saas/shared` 的**类型与运行时都走构建产物**：`exports.types` → `dist/index.d.ts`，`exports.import` → `dist/index.js`。改 shared 后必须先 `pnpm --filter @saas/shared build`（或 `dev` 开 watch），否则**类型检查与运行时一起是旧的**。
  注意 `exports.types` 写 `src/index.ts` 是**无效配置**：tsc 不把 `.ts` 当声明入口，会静默回退到 `import` 条件旁的 `dist/index.d.ts`，让人误以为"类型读源码"
- 声明产物的坑（2026-11-06 修复）：tsc 生成 `.d.ts` 时会把 zod 内部类型展开成 `z.z.core.$strip`，而 zod 4 的默认导出类型里没有 `z` 命名空间。消费方在 `moduleResolution: bundler` + `skipLibCheck: true` 下**不报错**，而是让所有 `z.infer` 出来的契约类型**静默退化成 `any`**。因此 shared 的契约文件必须 `import * as z from 'zod'`，不要用默认导入

## 功能开发流程

新功能按「先定决策、再写方案、最后编码」推进，方案文档在 `_docs/功能技术方案/`（模板与规则见该目录 `README.md`）：

1. 收到功能点需求后，**第一条回复只给决策清单**：拿不准或需用户拍板的点，每条写成「问题 / 推荐 / 不定的后果」。此阶段不建文件、不碰代码
2. 用户确认或修正决策后，再写 `NN-<功能>.md`，内容即定稿，状态直接「已确认 vX.Y」并记确认记录
3. 方案确认后才允许动业务代码；开发中方案需变更：先改文档升版本，再改代码。不允许代码先行、文档事后补
4. 测试全绿后改「已实现」，补「实际与方案的偏差」一节

**方案文档不设「未决项与风险」章节。** 决策在落文件前已定；真实的实现约束（cookie 属性、限流阈值、测试库、环境差异）写进对应的「关键约束」或「测试」小节，不另立章节、不留 TODO 清单。

**豁免（不写方案直接做）**：纯 bug 修复、样式 / 文案调整、依赖升级、注释补充。
**必须写方案**：新功能、接口契约变更、数据模型变更、权限 / 多租户相关、跨端联动。

方案与代码冲突时以代码为准，同时回头修订方案文档（与 `_docs/` 只追加修订的规则一致，改动在提交说明中指出）。

## 完成标准

一次改动视为完成，需同时满足：

1. `pnpm turbo run lint typecheck test` 全绿（**验证时机：提交之前跑一次即可，日常迭代改完不必每步都跑**，除非用户要求）
2. 提交信息通过 commitlint（见下方规范），不允许 `--no-verify` 绕过钩子
3. 接口契约变更时，同步更新 `packages/shared` 的类型 / schema
4. 行为或约定变化涉及 `_docs/` 既有文档的，在提交说明中指出（文档本身只追加修订）

## 提交规范

- Conventional Commits，commit-msg 钩子强制校验（commitlint + simple-git-hooks）
- header ≤ 120 字符；scope 建议：`web` / `shared` / `api` / `docs` / `deps` / `repo`
- 示例：`feat(api): 租户注册接口`
- pre-commit 会跑 lint-staged（eslint + prettier），失败要修复

## 代码风格

- Prettier 统一：100 列 · 单引号 · 分号 · 尾逗号 all · LF（根 `.prettierrc.json`）
- TypeScript strict；避免 `any`，必须用时加注释说明原因
- 未使用代码的口径：`unused-imports/no-unused-imports: error`（有 fixer，保存 / `--fix` 即删）；
  未使用的**变量、声明、函数一律不报**（`unused-imports/no-unused-vars` 与
  `@typescript-eslint/no-unused-vars` 均为 `off`）。开发期常留占位常量与待接入分支，
  提前报错只会逼人删掉再写回来；收尾时人工清一遍即可
- 前后端共享的请求 / 响应类型与 zod schema 放 `packages/shared`，不要在 web / api 里重复定义
- 中文注释与提交说明均可，但标识符、分支名用英文

## 禁区与注意

- `.env*` 不入库；密钥只进 `.env`（`apps/api/.env.example` 是变量清单）
- 不要手改 `pnpm-lock.yaml`；装 / 升依赖后由 pnpm 自动更新
- `_docs/` 是 PM 产出文档，只追加修订，不改写既有结论；实现与文档冲突时以代码为准，并在提交说明中指出
- 生成物目录不要手工编辑，也不要提交：`dist/`、`node_modules/`、`.turbo/`、`coverage/`、`.vitest/`、`src/generated/`（api 的 Prisma 生成物）
- 各包更细的约定见其目录内的 AGENTS.md（就近优先）
