import type { RouteMeta } from '@/app/routes/types';

export default {
  title: '回收站',
  icon: 'delete',
  order: 20,
  // 菜单隐藏 + 路由拦截：member 直连 /app/trash 会看到 403，而不是先渲染页面再被接口拒绝
  permission: 'trash.manage',
} satisfies RouteMeta;
