import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { Spin } from 'antd';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import { RequireAuth } from '@/app/guards/RequireAuth';
import { AuthLayout } from '@/app/AuthLayout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import NotFound from '@/pages/NotFound';
import Forbidden from '@/pages/Forbidden';

const Resources = lazy(() => import('@/pages/Resource'));

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
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
        path: 'resources',
        element: (
          // 路由级错误边界（规范 §18）：懒加载页崩溃只白屏该页，重试不刷新整站
          <ErrorBoundary scene="resources">
            <Suspense fallback={<Spin />}>
              <Resources />
            </Suspense>
          </ErrorBoundary>
        ),
      },
    ],
  },
  // 403：接口返回 403 时由页面级逻辑跳转过来（规范 §18：403 属页面级处理，不做全局拦截跳转）
  { path: '/403', element: <Forbidden /> },
  { path: '/', element: <Navigate to="/app" replace /> },
  // 404 兜底：匹配所有未定义路径，必须置于路由表末尾
  { path: '*', element: <NotFound /> },
]);

export { router };
