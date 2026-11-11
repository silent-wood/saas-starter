import { findRouteNode, menuOwner } from '@/app/routes/menu';
import { routeTree } from '@/app/routes/scan';
import { useTenantStore } from '@/stores/tenant';
import { useQueryClient } from '@tanstack/react-query';

/**
 * 切换租户（头像下拉与 `/select-tenant` 共用）
 *
 * `X-Tenant-Id` 由 `shared/api/client.ts` 的请求拦截器**每次请求时**从 store 读取，
 * 所以切换本身只要改 `currentTenantId`，不需要换 token、也不需要重新登录。
 * 真正要处理的是旧租户留下的缓存：queryKey 里没有租户维度，切换后
 * `['resource', id]` 装的仍是上一个租户的数据 —— 不报错、不 loading，
 * 只是静默显示别人的数据。这是这类功能最容易出的事故。
 */
export function useSwitchTenant() {
  const queryClient = useQueryClient();

  return async (id: string) => {
    if (id === useTenantStore.getState().currentTenantId) return;

    /**
     * 先取消在途请求，顺序不能反：removeQueries 只删已经落地的缓存，若删完
     * 旧租户的响应才回来，react-query 会为该 key 重新建项并写进去，脏数据照样留下。
     * cancelQueries 让在途 promise 的结果被丢弃，才是真正切断。
     */
    await queryClient.cancelQueries();
    useTenantStore.getState().setCurrent(id);

    /**
     * remove 而不是 invalidate：invalidate 只标记过期，旧数据仍留在缓存里继续渲染，
     * 用户会看到上一个租户的列表一直挂到新请求回来。
     * 也不能用 clear()：会把 `['tenants']` 一起清掉，菜单与权限跟着闪一下 ——
     * 而租户列表本身与当前租户无关，没必要重取。
     */
    queryClient.removeQueries({ predicate: ({ queryKey }) => queryKey[0] !== 'tenants' });
  };
}

/**
 * 切换后的落点：静态路径返回 `null` 表示原地不动。
 *
 * 动态段（`/app/resources/:id`）必须退回菜单归属页 —— 那个 id 在新租户里几乎必然
 * 不存在，留在原路径只会看到「资源不存在」。退回列表既保住「还在资源模块」的上下文，
 * 又不携带跨租户无效的 id。
 *
 * 静态路径不介入：切到权限更低的租户时，由 `RequirePermission` 原地渲染 403，
 * URL 与侧栏都还在，用户可以直接换菜单。
 */
export function tenantLanding(pathname: string): string | null {
  const node = findRouteNode(routeTree, pathname);
  if (!node?.urlPath.includes(':')) return null;
  return menuOwner(node)?.urlPath ?? '/app';
}
