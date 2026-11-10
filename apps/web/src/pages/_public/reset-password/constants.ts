/**
 * 重置密码页私有文案（规范 §24）
 *
 * 取自设计稿 R9「重置密码 · 链接有效」与 R10「重置密码 · 链接已失效」。
 * 唯一与稿不同的地方：R9 的副标题原本是「为 lishun@example.com 设置新密码」，
 * 但 `/reset-password?token=` 只带令牌、不带邮箱（令牌库里只存 sha256，反查不出明文邮箱），
 * 所以改成不含具体地址的通用说法，避免为了显示邮箱再加一个预检接口。
 */
export const RESET_COPY = {
  title: '设置新密码',
  desc: '请为你的账号设置新密码',
  passwordLabel: '新密码',
  confirmLabel: '确认新密码',
  passwordPlaceholder: '请输入新密码',
  confirmPlaceholder: '再次输入新密码',
  /** 强度提示两条，与 `resetPasswordSchema` 的规则一一对应，避免提示与校验脱节 */
  hintLength: '8–64 个字符',
  hintCharset: '同时包含字母与数字',
  /** 他端下线提醒（AC-04：重置时吊销该用户全部 refresh token） */
  notice: '重置后，其它设备上的登录状态将全部失效',
  submit: '重置密码',
  backToLogin: '返回登录',
  success: '密码已重置，请用新密码登录',

  invalidTitle: '链接已失效',
  invalidDesc: '重置链接只能使用一次，且 30 分钟内有效。请重新申请一条新的链接。',
  reapply: '重新获取链接',
} as const;
