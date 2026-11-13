/**
 * 审计页的展示字典与列配置常量（06 方案 F-21）
 *
 * 中文一律不在这里手写第二份：动作名、域前缀、对象类型名全部来自 `@saas/shared`
 * 的 AUDIT_* 字典。手写映射的问题是「后端新增一个动作后前端下拉里没有它」，
 * 而这种缺失不会报错，只表现为筛选项少一条 —— 没人会发现，直到有人问
 * 「为什么筛不到邀请撤销」。
 */
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS,
  AUDIT_DOMAIN_LABELS,
  AUDIT_OBJECT_TYPE_LABELS,
} from '@saas/shared';
import type { AuditAction } from '@saas/shared';

/** 表格与抽屉统一的时间格式。带秒：同一秒内的多条记录要能区分开 */
export const TIME_FORMAT = 'YYYY-MM-DD HH:mm:ss';

/** 默认查最近 30 天。与后端 service.list 的默认窗口保持一致，避免「前端看着 30 天、后端查 180 天」 */
export const DEFAULT_WINDOW_DAYS = 30;

/** 空态文案。默认的「暂无数据」会让人分不清是没数据还是筛选条件太窄 */
export const EMPTY_TEXT = '当前筛选条件下没有审计记录';

/**
 * 动作筛选下拉：17 项扁平，text 带域前缀（「成员与邀请 · 移除成员」）。
 *
 * 为什么不分组：ProTable 的 valueEnum 只吃一层结构，要分组得换 `treeSelect`
 * 或自定义 fieldProps，为 17 项引入树形交互不划算；加了域前缀在扁平列表里
 * 一样能按语义定位，且排序天然是 AUDIT_ACTIONS 的声明顺序（域相邻）。
 *
 * key 必须是动作码本身 —— 后端 `where.action` 直接与它比对，
 * 前端再做一层映射会让「下拉选中了却查不到」变成排查黑洞。
 */
export const ACTION_VALUE_ENUM: Record<string, { text: string }> = Object.fromEntries(
  Object.values(AUDIT_ACTIONS).map((action: AuditAction) => {
    const domain = action.split('.')[0];
    const label = AUDIT_ACTION_LABELS[action];
    return [action, { text: `${AUDIT_DOMAIN_LABELS[domain] ?? domain} · ${label}` }];
  }),
);

/**
 * 结果筛选下拉。key 与 `audit_logs.result` 的枚举值一致（success / failed），
 * 不要写成「成功/失败」——那是 text，不是提交值。
 */
export const RESULT_VALUE_ENUM = {
  success: { text: '成功' },
  failed: { text: '失败' },
} as const;

/**
 * 操作者角色 Tag 的配色。与成员页保持一致：owner 金、admin 蓝、member 灰。
 *
 * 键是 `@saas/shared` 的 ROLE 值（小写）。未知角色（将来加档）由调用方兜底成默认色，
 * 不要在这里写死一个 `?? 'gold'`——那会让「新角色」看起来像 owner。
 */
export const ROLE_TAG_COLOR: Record<string, string> = {
  owner: 'gold',
  admin: 'blue',
  member: 'default',
};

/**
 * 对象类型的兜底中文名。
 *
 * `objectType` 在历史数据里可能是 null（v1.2 之前的记录从没写过这一列），
 * 也可能是将来新增的类型。返回 null 而不是空串，让调用方用 `?? '对象'`
 * 显式决定降级文案，避免拼出「 · 1a2b3c4d」这种开头悬空的字符串。
 */
export const objectTypeLabel = (type: string | null): string | null => {
  if (!type) return null;
  return AUDIT_OBJECT_TYPE_LABELS[type] ?? type;
};
