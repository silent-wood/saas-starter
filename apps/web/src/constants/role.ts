/**
 * 角色展示文案（头像下拉、选择团队页共用）
 *
 * 枚举值是小写（`@saas/shared` 的 ROLE），展示层用中文 / 品牌词。
 * 放公共 constants 而不是某个页面的 constants.ts：现在有两处消费方，
 * 留在页面目录里会变成跨页面相对引用。
 */
export const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  admin: '管理员',
  member: '成员',
};
