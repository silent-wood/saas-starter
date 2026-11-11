/**
 * 权限路由守卫：把 meta.permission 从「只藏菜单」升级为真正拦路由
 *
 * 关键在 ready：角色是从 tenants 列表派生的，而该列表不持久化。刷新后列表还没
 * 落地时 role 为 null、can() 恒为 false —— 只看 can() 会把有权限的用户误判成 403。
 */
import { Spin } from 'antd';
import type { Permission } from '@saas/shared';
import type { ReactNode } from 'react';
import { usePermission } from '@/hooks/usePermission';
import Forbidden from '@/pages/Forbidden';

export interface RequirePermissionProps {
  permission: Permission;
  children: ReactNode;
}

export function RequirePermission({ permission, children }: RequirePermissionProps) {
  const { ready, can } = usePermission();

  if (!ready) {
    return (
      <div className="flex justify-center py-16">
        <Spin />
      </div>
    );
  }

  /**
   * 原地渲染 403，而不是 Navigate 到 /403：
   * 1. URL 保持用户原本要访问的地址，语义更准，也不会污染历史栈；
   * 2. 布局与侧栏还在，用户可以直接换别的菜单，而不是被扔到一个孤立页面；
   * 3. 若跳转到 /403，403 页的「返回」走 navigate(-1) 会回到被拦路径、再次被拦，
   *    形成来回打转。原地渲染下把返程目标固定为工作台即可绕开这个循环。
   */
  if (!can(permission)) return <Forbidden backTo="/app" />;

  return <>{children}</>;
}
