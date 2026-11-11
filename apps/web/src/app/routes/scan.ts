/**
 * 扫描 src/pages 下的约定目录，产出路由树
 *
 * 两次 glob 是有意为之：
 * - `meta.ts` 用 eager（纯数据，同步可得），菜单/面包屑/权限在模块初始化时就能算出来；
 * - `page.tsx` 不 eager，保留成 loader 交给 React.lazy，页面照旧按路由分包。
 * 若图省事把页面也 eager 进来，所有页面会被打进入口 chunk，首屏体积直接翻倍。
 *
 * glob 的参数必须是字面量（Vite 靠静态分析展开），所以下面两条路径不能抽成常量。
 */
import { GROUP_NAMES, GROUP_RULES, isGroupName } from './types';
import type { GroupName, PageModule, RouteMeta, RouteNode } from './types';

const PAGES_ROOT = '/src/pages';

const pageModules = import.meta.glob<PageModule>('/src/pages/**/page.tsx');
const metaModules = import.meta.glob<{ default: RouteMeta }>('/src/pages/**/meta.ts', {
  eager: true,
});

/** 约定违规清单：由 routes.test.ts 断言为空，运行时不打印以免污染测试输出 */
const violations: string[] = [];

const roots = {} as Record<GroupName, RouteNode>;
for (const group of GROUP_NAMES) {
  const rule = GROUP_RULES[group];
  roots[group] = {
    segment: rule.pathSegment ? group : '',
    urlPath: rule.pathSegment ? `/${group}` : '',
    dir: `${PAGES_ROOT}/${group}`,
    group,
    isGroup: true,
    children: [],
  };
}

/** `[id]` 目录 → `:id` 路由段；其余目录名原样作为 URL 段 */
function toSegment(dirName: string): string {
  const dynamic = /^\[(.+)\]$/.exec(dirName);
  return dynamic ? `:${dynamic[1]}` : dirName;
}

for (const [key, loader] of Object.entries(pageModules)) {
  const parts = key
    .slice(PAGES_ROOT.length + 1)
    .replace(/\/page\.tsx$/, '')
    .split('/');
  const groupName = parts[0];

  // 不在任何分组下的页面不会被挂载：宁可路由缺失（测试会失败），也不让它悄悄变成公开页
  if (!isGroupName(groupName)) {
    violations.push(`${key}：未归入分组，目录第一段必须是 ${GROUP_NAMES.join(' / ')}`);
    continue;
  }

  let node = roots[groupName];
  let dir = node.dir;
  let url = node.urlPath;

  for (const name of parts.slice(1)) {
    const segment = toSegment(name);
    dir = `${dir}/${name}`;
    url = `${url}/${segment}`;
    let child = node.children.find((c) => c.segment === segment);
    if (!child) {
      child = {
        segment,
        urlPath: url,
        dir,
        group: groupName,
        isGroup: false,
        children: [],
      };
      node.children.push(child);
    }
    node = child;
  }

  node.loader = loader;
  node.meta = metaModules[`${node.dir}/meta.ts`]?.default;
  if (!node.meta) violations.push(`${key}：缺少同目录 meta.ts（菜单名与权限都写在里面）`);
}

/** 同级排序：静态段恒在动态段之前（否则 /resources/new 会被 /resources/:id 吃掉） */
function compareNodes(a: RouteNode, b: RouteNode): number {
  const dynamic = (n: RouteNode) => (n.segment.startsWith(':') ? 1 : 0);
  return (
    dynamic(a) - dynamic(b) ||
    (a.meta?.order ?? 500) - (b.meta?.order ?? 500) ||
    a.segment.localeCompare(b.segment)
  );
}

/** 自顶向下补 parent、继承权限、排序 */
function finalize(node: RouteNode, parent?: RouteNode): void {
  node.parent = parent;
  // 子级继承父级权限：分组目录也能写 meta.ts 圈定整块（如设置区统一要求 settings.manage）
  node.permission = node.meta?.permission ?? parent?.permission;
  node.children.sort(compareNodes);
  for (const child of node.children) finalize(child, node);
}

export const routeTree: RouteNode[] = GROUP_NAMES.map((g) => roots[g])
  .map((root) => {
    finalize(root);
    return root;
  })
  .filter((root) => root.loader || root.children.length > 0);

export const routeViolations: readonly string[] = violations;

/**
 * 侧栏菜单的数据源：只取 app 分组（_public / _guarded 天然不会误入）。
 * 注意 app 根节点自身也是一页（工作台），它要和 children 平级出现在菜单里，
 * 而不是变成包住所有子项的父菜单 —— 具体展开由 menu.tsx 处理。
 */
export const appRoot = routeTree.find((root) => GROUP_RULES[root.group].menu);
