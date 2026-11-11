/**
 * 路由树 → react-router 的 RouteObject[]
 *
 * 分层顺序固定为：ErrorBoundary（页面崩溃）→ Suspense（懒加载）→ 权限守卫 → 页面。
 * 权限守卫放在 ErrorBoundary 内层，403 是被设计出来的状态，不该走错误上报。
 */
import { lazy, Suspense, type ReactNode } from 'react';
import { Outlet, type RouteObject } from 'react-router';
import { Spin } from 'antd';
import { AuthLayout } from '@/app/AuthLayout';
import { RequireAuth } from '@/app/guards/RequireAuth';
import { RequirePermission } from '@/app/guards/RequirePermission';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { routeTree } from './scan';
import { GROUP_RULES, type PageModule, type RouteNode } from './types';

/** 懒加载占位：用常量 JSX 而不是定义组件，避免本文件出现「组件 + 非组件混合导出」 */
const fallback = (
  <div className="flex justify-center py-16">
    <Spin />
  </div>
);

/** 叶子页面 */
function pageElement(node: RouteNode): ReactNode {
  /**
   * loader 包一层再交给 lazy，只为把「缺 default 导出」翻译成人话。
   *
   * `import.meta.glob` 的模块形状由 TS 推导成 `PageModule`，但那是**声明**不是事实：
   * 写成 `export const Foo = () => ...` 照样能编译，运行时 lazy 拿到的是模块命名空间
   * 对象（原型为 null），React 连错误都描述不出来，浏览器里只剩一句
   * `Cannot convert object to primitive value`（已在 select-tenant 上真实踩过）。
   * 这里补一道运行时断言，把成本从「猜半天」降到「看一行」；静态护栏见 routes.test.ts。
   */
  const Lazy = lazy(async () => {
    const mod = (await node.loader!()) as Partial<PageModule>;
    if (!mod.default) {
      throw new Error(
        `${node.dir}/page.tsx 缺少 default 导出：约定式路由用 lazy 挂载页面，命名导出不会被渲染`,
      );
    }
    return mod as PageModule;
  });
  const page = (
    <Suspense fallback={fallback}>
      <Lazy />
    </Suspense>
  );

  return (
    <ErrorBoundary scene={node.urlPath}>
      {node.permission ? (
        <RequirePermission permission={node.permission}>{page}</RequirePermission>
      ) : (
        page
      )}
    </ErrorBoundary>
  );
}

/** 结构层：只承载子路由，如 /app/resources 同时有 index 页与 /:id 子页时的那一层 */
function outletElement(node: RouteNode): ReactNode {
  return (
    <ErrorBoundary scene={node.urlPath}>
      <Suspense fallback={fallback}>
        <Outlet />
      </Suspense>
    </ErrorBoundary>
  );
}

/** 分组层：登录守卫与工作台布局都在这里套，页面自身不感知 */
function groupElement(node: RouteNode): ReactNode {
  const rule = GROUP_RULES[node.group];
  const shell = rule.layout === 'app' ? <AuthLayout /> : <Outlet />;
  return rule.guard === 'auth' ? <RequireAuth>{shell}</RequireAuth> : shell;
}

function toRoute(node: RouteNode): RouteObject {
  const childRoutes = node.children.map(toRoute);
  const indexRoute: RouteObject | null = node.loader
    ? { index: true, element: pageElement(node) }
    : null;

  if (node.isGroup) {
    return {
      // 下划线分组不占 URL 段，生成 pathless route
      ...(node.segment ? { path: node.segment } : {}),
      element: groupElement(node),
      children: [...(indexRoute ? [indexRoute] : []), ...childRoutes],
    };
  }

  if (!node.loader) {
    // 纯结构目录（自身没有 page.tsx），只负责把子路由挂到这一段路径下
    return { path: node.segment, element: outletElement(node), children: childRoutes };
  }

  if (childRoutes.length === 0) {
    return { path: node.segment, element: pageElement(node) };
  }

  // 目录既有自己的页面又有子路由（resources + resources/:id）：
  // 页面本身不渲染 Outlet，必须拆成「结构层 + index 子路由」
  return {
    path: node.segment,
    element: outletElement(node),
    children: [indexRoute!, ...childRoutes],
  };
}

export const conventionRoutes: RouteObject[] = routeTree.map(toRoute);
