# AGENTS.md — packages/shared

前后端共享的类型与 zod schema（包名 `@saas/shared`）。通用约定见仓库根 `AGENTS.md`。

## 结构与消费方式

- 源码只有 `src/index.ts` 一个入口，所有导出必须经它（`package.json` 的 `exports` 直指 `./src/index.ts`，消费方 import 源码，无需先构建本包）
- 文件变大后再按域拆 `src/<domain>.ts`，统一从 `index.ts` re-export，外部导入路径不变

## 约定

- 只放三类东西：TS 类型 / 接口、`as const` 常量枚举、zod schema（含 `z.infer` 派生类型）
- zod 版本必须与 `web` / `api` 保持一致（当前 4.6.7），升级要三包同步
- 运行时依赖只允许 zod；不要写 Node 专属 API（浏览器端 `web` 也要消费本包）
- 改动后跑 `pnpm --filter @saas/shared typecheck`，并确认 `web` / `api` 的 typecheck 不受影响
