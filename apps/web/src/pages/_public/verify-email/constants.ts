/**
 * 邮箱验证结果页私有文案（规范 §24）
 *
 * 取自设计稿 R11「邮箱验证 · 成功」与 R12「邮箱验证 · 链接无效」。
 * 两处与稿有意不同，原因都是「本期不动后端」：
 * 1. R11 的团队卡片原本显示团队名（如「星河科技」），但 `POST /auth/verify-email`
 *    只返回 `{ verified, tenantId }`，前端拿不到名称，因此改展示团队空间本身；
 * 2. R12 原本有「注册邮箱 + 重新发送验证邮件」按钮，但后端没有 resend 接口，
 *    改为回到注册页重新提交（契约：已注册未验证会覆盖密码并重发验证信）。
 */
export const VERIFY_COPY = {
  verifying: '正在验证邮箱…',

  successTitle: '邮箱已验证',
  successDesc: '账号已激活，从现在起可以登录。',
  successCardTitle: '团队空间已创建',
  successCardDesc: '你是该团队 Owner',
  successCardNote: '团队名称可在「设置 → 通用」中修改',
  successAction: '去登录',

  invalidTitle: '链接无效或已过期',
  invalidDesc: '验证链接 15 分钟内有效，且只能使用一次。如果已经验证过，直接登录即可。',
  invalidRetryHint: '重新提交注册可再收一封验证邮件',
  invalidAction: '返回注册',
  invalidBack: '返回登录',
} as const;
