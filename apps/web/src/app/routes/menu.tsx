/**
 * 路由树 → 侧栏菜单 / 高亮归属
 *
 * 菜单与路由共用同一棵树，这是本方案的核心收益：以前 BASE_MENU 和 router 是两份
 * 手写清单，加页面要改两处、hideInMenu 逻辑写两遍，天然会漂移。
 */
import type { MenuDataItem } from '@ant-design/pro-components';
import type { Permission } from '@saas/shared';
import { matchPath } from 'react-router';
import { ICONS } from './icons';
import type { RouteNode } from './types';

type Can = (permission: Permission) => boolean;

function visible(node: RouteNode, can: Can): boolean {
  const { meta } = node;
  if (!meta || meta.hideInMenu) return false;
  // permission 已在扫描阶段把祖先权限合并进来，这里判一次即可
  return !node.permission || can(node.permission);
}

function toMenuItem(node: RouteNode, can: Can): MenuDataItem | null {
  if (!visible(node, can)) return null;
  const children = node.children
    .map((child) => toMenuItem(child, can))
    .filter((child): child is MenuDataItem => child !== null);

  return {
    path: node.urlPath,
    name: node.meta!.title,
    icon: node.meta!.icon ? ICONS[node.meta!.icon] : undefined,
    // 无可见子项时不要留空 children，否则 ProLayout 会渲染出空的可展开分组
    ...(children.length > 0 ? { children } : {}),
  };
}

/**
 * app 分组根节点自身也是页面（工作台），它必须与子项平级。
 * 若直接走 toMenuItem，工作台会变成包住全部子菜单的父级 —— 层级就错了。
 */
export function menuFromTree(root: RouteNode | undefined, can: Can): MenuDataItem[] {
  if (!root) return [];
  const head: MenuDataItem[] = [];
  if (visible(root, can)) {
    head.push({
      path: root.urlPath,
      name: root.meta!.title,
      icon: root.meta!.icon ? ICONS[root.meta!.icon] : undefined,
    });
  }
  const rest = root.children
    .map((child) => toMenuItem(child, can))
    .filter((child): child is MenuDataItem => child !== null);

  return [...head, ...rest];
}

/** 找与当前路径最匹配的节点（长路径优先，路由树最多几十个节点，遍历开销可忽略） */
export function findRouteNode(nodes: RouteNode[], pathname: string): RouteNode | undefined {
  let best: RouteNode | undefined;
  const visit = (node: RouteNode) => {
    if (node.urlPath && matchPath({ path: node.urlPath, end: true }, pathname)) {
      if (!best || node.urlPath.length > best.urlPath.length) best = node;
    }
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return best;
}

/**
 * 菜单高亮归属：当前节点自己在菜单里就用它，否则沿 parent 上溯到最近的可见节点。
 * 资源详情（hideInMenu）因此自动归属「资源列表」，不需要再写「子路由模式优先」的特判。
 */
export function menuOwner(node: RouteNode | undefined): RouteNode | undefined {
  let current = node;
  while (current) {
    if (current.meta && !current.meta.hideInMenu) return current;
    current = current.parent;
  }
  return undefined;
}
