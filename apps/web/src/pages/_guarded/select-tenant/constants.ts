/**
 * 选择团队页私有文案（规范 §24）
 *
 * 这一屏在设计稿里没有对应画板（R1–R15 补稿未覆盖），
 * 按认证族卡片的既有视觉自拟，文案沿用产品里「团队」的说法，不用「租户」。
 */
export const SELECT_TENANT_COPY = {
  title: '选择团队',
  desc: '你的账号属于多个团队，选择要进入的一个',
  empty: '还没有加入任何团队',
  emptyHint: '请联系团队管理员把你加入团队后再试',
  logout: '退出登录',
  loading: '正在加载团队…',
} as const;

/** 角色展示文案：枚举值是小写（shared/roles.ts），展示层用中文/品牌词 */
export const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  admin: '管理员',
  member: '成员',
};
