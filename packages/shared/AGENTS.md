# AGENTS.md — packages/shared

前后端共享的类型与 zod schema（包名 `@saas/shared`）。通用约定见仓库根 `AGENTS.md`。

## 结构与消费方式

- 源码入口是 `src/index.ts`，所有导出必须经它；文件变大后再按域拆 `src/<domain>.ts`，统一从 `index.ts` re-export，外部导入路径不变
- **消费方走构建产物**：`package.json` 的 `exports` 指向 `./dist/index.js` 与 `./dist/index.d.ts`。改完源码必须 `pnpm --filter @saas/shared build`（或 `dev` 开 watch），否则 `web` / `api` 拿到的是旧产物
- 相对导入一律带 `.js` 后缀：源码写 `from "./errors.js"`，TS 负责映射到 `.ts` 源，Node 运行时才能解析（ESM 规范要求完整扩展名）

## 约定

- 只放三类东西：TS 类型 / 接口、`as const` 常量枚举、zod schema（含 `z.infer` 派生类型）
- zod 版本必须与 `web` / `api` 保持一致（当前 4.6.7），升级要三包同步
- 运行时依赖只允许 zod；不要写 Node 专属 API（浏览器端 `web` 也要消费本包）
- 改动后跑 `pnpm --filter @saas/shared typecheck` + `build`，并确认 `web` / `api` 的 typecheck 不受影响
