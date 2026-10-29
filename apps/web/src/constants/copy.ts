/**
 * 跨页面共享文案表（规范 §24：i18n 轻量方案）
 *
 * 约定：跨页面复用的文案集中在此；页面私有文案放 pages/<Name>/constants.ts。
 * 将来接 react-intl 时，只需把本表替换为 <FormattedMessage> 映射。
 * 书写规范见 §24：按钮动宾结构、空态给行动指引、错误文案说人话。
 */
export const COPY = {
  common: {
    appName: "SaaS Starter",
    retry: "重试",
    backHome: "返回首页",
    logout: "退出登录",
    networkError: "网络不稳定，请稍后重试",
  },
  auth: {
    loginTitle: "登录",
    email: "邮箱",
    password: "密码",
    loginAction: "登录",
    loginExpired: "登录已过期，请重新登录",
  },
  error: {
    pageCrashTitle: "页面出错了",
    pageCrashDesc: "渲染过程中发生异常，可重试或返回首页",
  },
} as const;
