/**
 * 约定式路由的契约
 *
 * 目录结构承载「路由形状 + 登录边界」，`meta.ts` 承载「菜单与权限」。
 * 页面作者只需要建目录、写 page.tsx 与 meta.ts，不再改 router 或菜单数组。
 *
 * 分组目录（第一段）决定登录边界，它们本身不产生 URL 段：
 * - `_public`  无需登录（登录/注册/找回密码…）
 * - `_guarded` 需登录但无工作台布局（选租户）
 * - `app`      需登录 + 工作台布局 + 进侧栏菜单
 * 用下划线而非括号，是因为 import.meta.glob 的匹配器把 `(` 当 extglob 起始符。
 */
import type { ComponentType } from 'react';
import type { Permission } from '@saas/shared';

/** 菜单图标用字符串键，避免 meta.ts 反向依赖组件库、也保证 meta 是可序列化纯数据 */
export type IconName = 'appstore' | 'database' | 'delete' | 'team' | 'robot' | 'pay' | 'setting';

/** 页面元信息：与 page.tsx 同目录的 meta.ts 默认导出 */
export interface RouteMeta {
  /** 菜单名 + 面包屑名；必填，测试会校验每个页面都有 */
  title: string;
  icon?: IconName;
  /** 同级排序，缺省按路径字典序（静态段恒在动态段之前） */
  order?: number;
  /** 无此权限时：菜单隐藏 + 路由拦截（原地渲染 403，不改 URL） */
  permission?: Permission;
  /** 路由存在但不出现在菜单（详情页这类） */
  hideInMenu?: boolean;
}

export type GroupName = '_public' | '_guarded' | 'app';

/** 分组的包装方式。属于框架结构，页面作者不应修改 */
export interface GroupRule {
  /** none = 公开；auth = 需要登录 */
  guard: 'none' | 'auth';
  /** 该组的路由节点是否套工作台布局 */
  layout: 'none' | 'app';
  /** 是否从该组生成侧栏菜单 */
  menu: boolean;
  /** 分组自身是否占一个 URL 段（app 占，下划线分组不占） */
  pathSegment: boolean;
}

export const GROUP_RULES: Record<GroupName, GroupRule> = {
  _public: { guard: 'none', layout: 'none', menu: false, pathSegment: false },
  _guarded: { guard: 'auth', layout: 'none', menu: false, pathSegment: false },
  app: { guard: 'auth', layout: 'app', menu: true, pathSegment: true },
};

export const GROUP_NAMES = Object.keys(GROUP_RULES) as GroupName[];

export function isGroupName(name: string): name is GroupName {
  return name in GROUP_RULES;
}

/** page.tsx 被动态导入后的模块形状（React.lazy 要求的正是这个） */
export interface PageModule {
  default: ComponentType;
}

/** page.tsx 的动态导入入口 */
export type PageLoader = () => Promise<PageModule>;

/** 扫描后得到的路由树节点 */
export interface RouteNode {
  /** URL 段（已把 [id] 转成 :id）；下划线分组为 '' */
  segment: string;
  /** 完整 URL 路径，如 /app/resources/:id；分组根节点可能为 '' */
  urlPath: string;
  /** 源码目录，如 /src/pages/app/resources/[id] */
  dir: string;
  group: GroupName;
  /** 是否为分组根节点 */
  isGroup: boolean;
  meta?: RouteMeta;
  /** page.tsx 的懒加载入口；结构目录（无自身页面）无此值 */
  loader?: PageLoader;
  /** 自身与祖先合并后的权限（子级继承父级） */
  permission?: Permission;
  children: RouteNode[];
  parent?: RouteNode;
}
