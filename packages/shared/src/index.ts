/**
 * 前后端契约的**唯一入口**。
 *
 * 纪律（见根 AGENTS.md）：
 * - 契约本体在 `contracts/` 下按域分文件（auth / tenant / envelope）；角色与权限在 `roles.ts` /
 *   `permissions.ts`，错误码在 `errors.ts`。本文件只做汇总 re-export，不再定义任何 schema。
 * - 包内文件禁止互相 `import './index.js'`（会成环），依赖只能指向更底层的兄弟文件。
 *   判据：某个文件需要另一个文件的类型时，说明后者该下沉——`Role` 下沉到 `roles.ts`，
 *   `permissions.ts` 才有合法的依赖方向。
 * - `apps/web` 与 `apps/api` 一律从 `@saas/shared` 导入，**禁止在两端各写一份副本**
 *   （改一处漏一处必然导致联调时字段对不上），也不为拆出的文件开子路径导出。
 * - schema 同时承担运行时校验职责：后端 `StandardSchemaValidationPipe` 直接拿它校验请求体，
 *   前端 RHF 用 `zodResolver` 校验表单，两边规则因此天然一致。
 * - 改本包任何文件之后必须 `pnpm --filter @saas/shared build`，否则消费方读到的还是旧 `dist`。
 *   相对导入必须带 `.js` 扩展名——产物是原生 ESM，`moduleResolution: nodenext` 会在构建期拦住漏写。
 */

export * from './errors.js';
export * from './audit-actions.js';
export * from './permissions.js';
export * from './roles.js';
export * from './resource-categories.js';
export * from './contracts/auth.js';
export * from './contracts/envelope.js';
export * from './contracts/resource.js';
export * from './contracts/tenant.js';
