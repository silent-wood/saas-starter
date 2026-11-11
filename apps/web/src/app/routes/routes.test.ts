/**
 * 约定式路由的护栏
 *
 * 文件路由没有编译器兜底：目录放错、忘了 meta.ts，页面照样能跑，只是悄悄从菜单
 * 消失或裸奔成公开页。所以约定本身必须被测试锁住，而不是靠 review 记住。
 */
import type { MenuDataItem } from '@ant-design/pro-components';
import type { RouteObject } from 'react-router';
import { describe, expect, it } from 'vitest';
import { conventionRoutes } from './build';
import { findRouteNode, menuFromTree, menuOwner } from './menu';
import { appRoot, routeTree, routeViolations } from './scan';
import type { RouteNode } from './types';

function collectPaths(routes: RouteObject[], prefix = ''): string[] {
  const paths: string[] = [];
  for (const route of routes) {
    const path = route.path ? `${prefix}/${route.path}` : prefix;
    if (route.index) paths.push(path || '/');
    else if (route.path) paths.push(path);
    if (route.children) paths.push(...collectPaths(route.children, path));
  }
  return paths;
}

function flattenMenu(items: MenuDataItem[]): MenuDataItem[] {
  return items.flatMap((item) => [item, ...flattenMenu(item.children ?? [])]);
}

const allowAll = () => true;

describe('约定式路由', () => {
  it('每个 page.tsx 都有同目录 meta.ts 且归入已知分组', () => {
    expect(routeViolations).toEqual([]);
  });

  it('三个分组都生成了预期路径', () => {
    const paths = new Set(collectPaths(conventionRoutes));
    expect([...paths]).toEqual(
      expect.arrayContaining([
        '/login',
        '/register',
        '/verify-email',
        '/forgot-password',
        '/reset-password',
        '/select-tenant',
        '/app',
        '/app/resources',
        '/app/resources/:id',
        '/app/trash',
      ]),
    );
  });

  it('同级的动态段排在静态段之后', () => {
    const walk = (node: RouteNode) => {
      const kinds = node.children.map((child) => (child.segment.startsWith(':') ? 1 : 0));
      expect(kinds).toEqual([...kinds].sort());
      node.children.forEach(walk);
    };
    routeTree.forEach(walk);
  });

  it('菜单只来自 app 分组，详情页与公开页不进菜单', () => {
    const paths = flattenMenu(menuFromTree(appRoot, allowAll)).map((item) => item.path);
    expect(paths).toContain('/app');
    expect(paths).toContain('/app/resources');
    expect(paths).not.toContain('/app/resources/:id');
    expect(paths).not.toContain('/login');
  });

  it('菜单标题唯一（否则面包屑与侧栏会指向同一个名字的不同页面）', () => {
    const titles = flattenMenu(menuFromTree(appRoot, allowAll)).map((item) => String(item.name));
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('无权限时菜单隐藏，但路由节点仍在（由守卫渲染 403）', () => {
    const menu = flattenMenu(menuFromTree(appRoot, (permission) => permission !== 'trash.manage'));
    expect(menu.map((item) => item.path)).not.toContain('/app/trash');
    expect(findRouteNode(routeTree, '/app/trash')?.urlPath).toBe('/app/trash');
  });

  it('详情页高亮归属资源列表', () => {
    const node = findRouteNode(routeTree, '/app/resources/abc123');
    expect(node?.urlPath).toBe('/app/resources/:id');
    expect(menuOwner(node)?.urlPath).toBe('/app/resources');
  });

  it('权限沿目录继承：回收站节点带 trash.manage', () => {
    expect(findRouteNode(routeTree, '/app/trash')?.permission).toBe('trash.manage');
  });
});
