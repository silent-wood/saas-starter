import type { RouteMeta } from '@/app/routes/types';

/** 详情页：路由存在但不进菜单，高亮归属由 menuOwner 上溯到「资源列表」 */
export default {
  title: '资源详情',
  hideInMenu: true,
} satisfies RouteMeta;
