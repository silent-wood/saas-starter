/**
 * 登录页私有文案与本地键（规范 §24）
 *
 * `REMEMBERED_EMAIL_KEY` 只存邮箱，不存任何凭证：
 * access token 在内存、refresh 在 httpOnly cookie，localStorage 里放令牌等于
 * 把长期凭证交给 XSS。这里存的仅是「上次用哪个邮箱登录」，纯体验优化。
 */
export const REMEMBERED_EMAIL_KEY = 'saas:last-email';

export const LOGIN_COPY = {
  /** 从注册页跳来时置顶的提示标题 */
  registeredTitle: '验证邮件已发送',
  /** 提示正文：给出下一步动作与时限，避免用户停在「然后呢」 */
  registeredDesc: (email: string) =>
    `请到 ${email} 查收验证邮件，点击链接完成激活后即可登录（15 分钟内有效）。`,
  /** 注册页跳来时预填的提示条关闭按钮文案 */
  registeredClose: '知道了',
  /** 登录失败的兜底文案 */
  submitFailed: '登录失败，请稍后重试',
} as const;
