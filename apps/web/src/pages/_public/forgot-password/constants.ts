/**
 * 找回密码页私有文案（规范 §24：页面私有文案放 pages/<Name>/constants.ts）
 *
 * 文案取自设计稿 R7「找回密码 · 申请重置」与 R8「找回密码 · 邮件已发送」。
 */
export const FORGOT_COPY = {
  title: '找回密码',
  desc: '输入注册邮箱，我们会发送重置链接',
  submit: '发送重置链接',
  /** 表单底部辅助说明：为什么只发链接、链接多久失效 */
  hint: '链接 30 分钟内有效，且仅可使用一次',

  sentTitle: '邮件已发送',
  /** 防枚举：无论邮箱是否存在都显示同一句话，不暴露账号状态（方案 02 AC-01） */
  sentDescPrefix: '若',
  sentDescSuffix: '已注册',
  sentDescExpire: '重置链接已送达，30 分钟内有效',
  sentDescSpam: '没收到请检查垃圾邮件箱',
  resend: '重新发送',
  /** 底部兜底：不给「联系管理员」挂死链，产品里还没有客服入口 */
  sentFooter: '没收到？请确认邮箱拼写，或联系团队管理员',

  backToLogin: '返回登录',
  rateLimited: '尝试过于频繁，请 15 分钟后再试',
} as const;

/** 重发冷却秒数。方案 02 AC-11 限流是 5 次 / 15 分钟，前端先用 60s 挡住连点 */
export const RESEND_COOLDOWN_SECONDS = 60;
