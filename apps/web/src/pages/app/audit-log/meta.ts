import type { RouteMeta } from '@/app/routes/types';

export default {
  title: '审计日志',
  icon: 'audit',
  // 资源 10 / 回收站 20 / 成员 30 / AI 40 / 订阅 50 / 审计 60 / 设置 70
  order: 60,
  // member 侧栏隐藏 + 直连 /app/audit-log 原地渲染 403（不改 URL）。
  // 与 trash 同一套写法：页面级拦截先于接口，用户看到的是「无权查看」而不是一屏空表。
  permission: 'audit.view',
} satisfies RouteMeta;
