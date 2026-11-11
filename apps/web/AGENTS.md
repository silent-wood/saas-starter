# AGENTS.md — apps/web

Vite + React 19 前端 SPA（包名 `web`）。通用约定见仓库根 `AGENTS.md`。

## 命令（在仓库根目录执行）

- 开发：`pnpm --filter web dev`（http://localhost:5173）
- 构建：`pnpm --filter web build`（先 `tsc --noEmit` 再 vite build）
- lint / 类型检查 / 单测：`pnpm --filter web lint | typecheck | test`（Vitest + Testing Library）

## 目录职责

- `src/app/` 应用装配（约定式路由 `routes/`、布局 `AuthLayout.tsx`、守卫 `guards/`）
- `src/pages/` 路由页面，按分组目录组织（见下节）；不在分组目录里的文件不会被挂载
- `src/components/` 复用组件；`src/shared/` 跨页面共享的非组件代码（如 api client）
- `src/stores/` Zustand；`src/hooks/`、`src/utils/`、`src/constants/`、`src/styles/`

## 新增页面：只加文件，不改路由

路由与侧栏菜单由 `src/pages` 的目录自动生成（扫描逻辑见 `src/app/routes/scan.ts`）。
**不要改 `router.tsx`，也不要手写菜单数组。**

目录第一段决定登录边界，该段本身不产生 URL：

| 目录 | 需要登录 | 工作台布局 | 进侧栏菜单 |
|---|---|---|---|
| `src/pages/_public/` | 否 | 无 | 否 |
| `src/pages/_guarded/` | 是 | 无 | 否 |
| `src/pages/app/` | 是 | AuthLayout | 是 |

新增业务页（以「成员管理」为例）：

1. 建目录 `src/pages/app/members/`
2. `page.tsx` 默认导出页面组件；文案常量放同目录 `constants.ts`，单测放同目录 `page.test.tsx`
3. 同目录 `meta.ts`：`export default { title: '成员管理', icon: 'team', order: 30 } satisfies RouteMeta`
4. 动态段用 `[id]` 目录（生成 `:id`）；详情页这类不进菜单的写 `hideInMenu: true`
5. 需要权限的写 `permission: 'trash.manage'`：菜单隐藏 **且** 直连 URL 时原地渲染 403（不改 URL）

`icon` 取值受 `IconName` 联合类型约束，新增图标在 `src/app/routes/icons.tsx` 补一行。
约定由 `src/app/routes/routes.test.ts` 守住（缺 meta / 标题重名 / 静态段顺序错都会 fail）。

## 状态与 UI 约定

- 服务端状态一律 TanStack Query，客户端状态用 Zustand；不要把接口数据复制进 Zustand。接口调用统一走 `src/shared/api/client.ts`，不要在组件里手写 fetch
- UI 基于 antd 6 + Tailwind 4：**组件优先使用 ProComponents**（ProLayout / ProTable / ModalForm / PageContainer 等），antd 基础组件作补充，不自造已有能力的视觉原语
- 表单用 React Hook Form + zod；schema 已在 `@saas/shared` 定义的直接复用，不重复声明
- 组件先满足当前页面需要；出现第二处复用再提取到 `src/components/`
