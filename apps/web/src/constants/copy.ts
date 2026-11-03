/**
 * 跨页面共享文案表（规范 §24：i18n 轻量方案）
 *
 * 约定：跨页面复用的文案集中在此；页面私有文案放 pages/<Name>/constants.ts。
 * 将来接 react-intl 时，只需把本表替换为 <FormattedMessage> 映射。
 * 书写规范见 §24：按钮动宾结构、空态给行动指引、错误文案说人话。
 *
 * auth 组文案取设计稿「S1 登录」画板的实际文字，不自行改写。
 */
export const COPY = {
  common: {
    appName: 'SaaS Starter',
    retry: '重试',
    backHome: '返回首页',
    logout: '退出登录',
    networkError: '网络不稳定，请稍后重试',
  },
  auth: {
    /** 品牌区价值主张 */
    valueProp: '团队协作 · 知识库 · AI 助手',
    tabLogin: '登录',
    tabRegister: '注册',
    email: '邮箱',
    password: '密码',
    confirmPassword: '确认密码',
    name: '姓名',
    tenantName: '团队名称',
    rememberMe: '记住我',
    forgotPassword: '忘记密码?',
    /** 找回密码属方案 02，尚未实现，点击给明确反馈而不是静默无响应 */
    forgotPasswordTodo: '找回密码功能开发中',
    loginAction: '登录',
    registerAction: '注册',
    loginExpired: '登录已过期，请重新登录',
    privacyLogin: '登录即代表同意《服务条款》与《隐私政策》',
    privacyRegister: '注册即代表同意《服务条款》与《隐私政策》',
  },
  error: {
    pageCrashTitle: '页面出错了',
    pageCrashDesc: '渲染过程中发生异常，可重试或返回首页',
  },
} as const;
