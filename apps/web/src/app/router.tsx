import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router';
import { Spin } from 'antd';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Dashboard from '@/pages/Dashboard';
import { RequireAuth } from '@/app/guards/RequireAuth';
import { AuthLayout } from '@/app/AuthLayout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import NotFound from '@/pages/NotFound';
import Forbidden from '@/pages/Forbidden';
import VerifyEmail from '@/pages/VerifyEmail';
import { ForgotPassword } from '@/pages/ForgotPassword';
import { SelectTenant } from '@/pages/SelectTenant';
import { ResetPassword } from '@/pages/ResetPassword';
import { PlaceholderPage } from '@/pages/Placeholder';

const Resources = lazy(() => import('@/pages/Resource'));
const ResourceDetail = lazy(() => import('@/pages/Resource/Detail'));
const Trash = lazy(() => import('@/pages/Trash'));

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  { path: '/verify-email', element: <VerifyEmail /> }, // 新增，公开
  { path: '/forgot-password', element: <ForgotPassword /> }, // 新增，公开
  { path: '/reset-password', element: <ResetPassword /> }, // 新增，公开
  {
    path: '/select-tenant', // 新增，需登录但无布局
    element: (
      <RequireAuth>
        <SelectTenant />
      </RequireAuth>
    ),
  },
  {
    path: '/app',
    element: (
      <RequireAuth>
        <AuthLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Dashboard /> },
      {
        // 资源模块嵌套子路由：列表为 index，详情为 :id 子路由。
        // 父路由仅做结构承载（Outlet + 统一错误边界），两个子页各自独立渲染。
        path: 'resources',
        element: (
          // 路由级错误边界（规范 §18）：懒加载页崩溃只白屏该页，重试不刷新整站
          <ErrorBoundary scene="resources">
            <Suspense fallback={<Spin />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        ),
        children: [
          { index: true, element: <Resources /> },
          {
            path: ':id',
            element: (
              <ErrorBoundary scene="resourceDetail">
                <Suspense fallback={<Spin />}>
                  <ResourceDetail />
                </Suspense>
              </ErrorBoundary>
            ),
          },
        ],
      },
      {
        path: 'trash',
        element: (
          <ErrorBoundary scene="trash">
            <Suspense fallback={<Spin />}>
              <Trash />
            </Suspense>
          </ErrorBoundary>
        ),
      },
      // 以下为占位页：菜单已出、功能未开发，落地时替换成真实页面组件
      { path: 'members', element: <PlaceholderPage title="成员管理" /> },
      { path: 'ai', element: <PlaceholderPage title="AI 助手" /> },
      { path: 'billing', element: <PlaceholderPage title="订阅支付" /> },
      { path: 'invite', element: <PlaceholderPage title="邀请中心" /> },
      { path: 'settings', element: <PlaceholderPage title="设置" /> },
    ],
  },
  // 403：接口返回 403 时由页面级逻辑跳转过来（规范 §18：403 属页面级处理，不做全局拦截跳转）
  { path: '/403', element: <Forbidden /> },
  { path: '/', element: <Navigate to="/app" replace /> },
  // 404 兜底：匹配所有未定义路径，必须置于路由表末尾
  { path: '*', element: <NotFound /> },
]);

export { router };
