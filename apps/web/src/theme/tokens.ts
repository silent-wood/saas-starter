/**
 * 设计令牌 · TypeScript 侧（antd 主题）
 *
 * 唯一来源：设计稿 Ardot「SaaS Starter · UI 设计图 v0.1」的
 * 「色彩速查」与各页「红线标注（单位 px）」。
 *
 * 为什么令牌有两处：antd 的 ConfigProvider 只吃 JS 值，Tailwind 只吃 CSS 变量。
 * 所以 `src/styles/global.css` 的 `@theme` 块里有一份同名变量，
 * 由 `tokens.sync.test.ts` 做机械校验——改一处不改另一处会直接测试失败。
 *
 * 红线稿原文（S1 登录）：
 * - 卡片 360 宽，padding 32，radius 8，shadow 0 4px 12px rgba(0,0,0,.10)
 * - Logo 48×48 radius 8；Tab 高 32、选中下划线 2px
 * - 输入框 h32 · radius 6 · padding 0 12 · 边框 1px #D9D9D9
 * - 主按钮 h40 通栏 radius 6，字 16/24 Medium
 * - 字段间距 16，标签与输入间距 4，卡内段间距 24
 */
import type { ThemeConfig } from 'antd';

/** 色板：键名与设计稿「色彩速查」一一对应 */
export const COLOR = {
  /** 主色：按钮 / 选中 / 链接 */
  primary: '#1A56DB',
  primaryHover: '#3D72E4',
  primaryActive: '#1648B5',
  /** 选中浅底 primary-1 */
  primaryBg: '#F0F5FF',
  success: '#52C41A',
  warning: '#FAAD14',
  danger: '#FF4D4F',
  /** 标题 / 正文 text-1 */
  ink: '#262626',
  /** 正文辅助 */
  ink2: '#595959',
  /** 辅助 / 未选中 */
  ink3: '#8C8C8C',
  /** 占位与禁用 */
  inkDisabled: '#BFBFBF',
  /** 边框 */
  line: '#D9D9D9',
  /** 分割线 */
  split: '#F0F0F0',
  /** 页面底 bg-layout */
  layout: '#F5F5F5',
  /** 卡片 / 侧栏 */
  surface: '#FFFFFF',
} as const;

/** 字族：设计稿指定 Noto Sans SC，后续按平台回退 */
export const FONT_FAMILY =
  "'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";

/** 字号阶梯（字号/行高/字重）：标题 20/28 600 · 按钮 16/24 500 · 正文 14/22 400 · 标签 13/20 500 · 辅助 12/18 400 */
export const TYPO = {
  title: { fontSize: 20, lineHeight: 28, fontWeight: 600 },
  button: { fontSize: 16, lineHeight: 24, fontWeight: 500 },
  body: { fontSize: 14, lineHeight: 22, fontWeight: 400 },
  label: { fontSize: 13, lineHeight: 20, fontWeight: 500 },
  caption: { fontSize: 12, lineHeight: 18, fontWeight: 400 },
} as const;

/** 尺寸令牌 */
export const SIZE = {
  /** 表单卡宽度 */
  cardWidth: 360,
  /** 卡片内边距 */
  cardPadding: 32,
  /** 圆角 */
  radius: 6,
  /** 卡片专属圆角（设计稿单独标注 8） */
  cardRadius: 8,
  /** 常规控件高度 */
  controlHeight: 32,
  /** 主按钮高度 */
  controlHeightLG: 40,
  /** 字段间距 */
  fieldGap: 16,
  /** 标签与输入间距 */
  labelGap: 4,
  /** 卡内段间距 */
  blockGap: 24,
} as const;

/** 卡片投影：0 4px 12px rgba(0,0,0,.10) */
export const SHADOW_CARD = '0 4px 12px rgba(0, 0, 0, 0.1)';

/**
 * antd 主题：把设计令牌映射成 ThemeConfig。
 * 只映射有明确设计依据的令牌，不猜测未标注的细节。
 */
export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: COLOR.primary,
    colorPrimaryHover: COLOR.primaryHover,
    colorPrimaryActive: COLOR.primaryActive,
    colorPrimaryBg: COLOR.primaryBg,
    colorSuccess: COLOR.success,
    colorWarning: COLOR.warning,
    colorError: COLOR.danger,
    colorLink: COLOR.primary,
    colorText: COLOR.ink,
    colorTextSecondary: COLOR.ink2,
    colorTextTertiary: COLOR.ink3,
    colorTextPlaceholder: COLOR.inkDisabled,
    colorTextDisabled: COLOR.inkDisabled,
    colorBorder: COLOR.line,
    colorSplit: COLOR.split,
    colorBgLayout: COLOR.layout,
    colorBgContainer: COLOR.surface,
    fontFamily: FONT_FAMILY,
    fontSize: TYPO.body.fontSize,
    borderRadius: SIZE.radius,
    controlHeight: SIZE.controlHeight,
    controlHeightLG: SIZE.controlHeightLG,
  },
  components: {
    Button: {
      fontWeight: TYPO.button.fontWeight,
      /** 主按钮：通栏 16/24 */
      contentFontSizeLG: TYPO.button.fontSize,
    },
  },
};
