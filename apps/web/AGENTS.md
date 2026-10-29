# AGENTS.md — apps/web

Vite + React 19 前端 SPA（包名 `web`）。通用约定见仓库根 `AGENTS.md`。

## 命令（在仓库根目录执行）

- 开发：`pnpm --filter web dev`（http://localhost:5173）
- 构建：`pnpm --filter web build`（先 `tsc --noEmit` 再 vite build）
- lint / 类型检查 / 单测：`pnpm --filter web lint | typecheck | test`（Vitest + Testing Library）

## 目录职责

- `src/app/` 应用装配（路由 `router.tsx`、布局 `AuthLayout.tsx`、守卫 `guards/`）
- `src/pages/` 路由页面；`src/components/` 复用组件；`src/shared/` 跨页面共享的非组件代码（如 api client）
- `src/stores/` Zustand；`src/hooks/`、`src/utils/`、`src/constants/`、`src/styles/`

## 新增页面落点

以新增页面 `Tenant` 为例（参照现有 Login / Resource 的既有写法）：

1. 新建 `src/pages/Tenant/`，内含 `index.tsx`；页面文案常量放同目录 `constants.ts`，单测放同目录 `index.test.tsx`
2. 在 `src/app/router.tsx` 注册路由：
   - 登录类页面挂路由表顶层（`/login` 同级）
   - 业务页挂在 `/app` 下 `RequireAuth + AuthLayout` 的 `children` 内
   - 重组件用 `lazy()` 导入，并包 `ErrorBoundary + Suspense`（见 Resource 页写法）
   - 404 通配路由（`path: "*"`）必须保持在路由表末尾
3. 接口调用走 `src/shared/api/client.ts`，数据获取用 TanStack Query，不要在组件里手写 fetch

## 状态与 UI 约定

- 服务端状态一律 TanStack Query，客户端状态用 Zustand；不要把接口数据复制进 Zustand
- UI 基于 antd 6 + Tailwind 4：优先复用 antd 组件与设计变量，不自造视觉原语
- 表单用 React Hook Form + zod；schema 已在 `@saas/shared` 定义的直接复用，不重复声明
- 组件先满足当前页面需要；出现第二处复用再提取到 `src/components/`
