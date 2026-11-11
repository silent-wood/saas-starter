/**
 * 路由表：业务路由由 src/pages 的约定目录自动生成
 *
 * 这里只留无法归入分组的全局兜底：
 * - `/` 重定向到工作台
 * - `/403` 页面级 403 的跳转落点（权限守卫本身原地渲染，不改 URL）
 * - `*` 404 兜底，必须最后一条
 *
 * 新增页面不要改这个文件：建目录 + page.tsx + meta.ts 即可（规则见 app/routes/scan.ts）。
 * 登录边界由目录分组决定：_public 无需登录、_guarded 需登录无布局、app 需登录 + 布局 + 菜单。
 */
import { createBrowserRouter, Navigate } from 'react-router';
import { conventionRoutes } from '@/app/routes/build';
import Forbidden from '@/pages/Forbidden';
import NotFound from '@/pages/NotFound';

const router = createBrowserRouter([
  ...conventionRoutes,
  { path: '/403', element: <Forbidden /> },
  { path: '/', element: <Navigate to="/app" replace /> },
  { path: '*', element: <NotFound /> },
]);

export { router };
