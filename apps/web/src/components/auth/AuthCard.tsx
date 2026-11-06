import type { ReactNode } from 'react';
import { COPY } from '@/constants/copy';

interface AuthCardProps {
  children: ReactNode;
  /**
   * 是否显示品牌区（Logo + 产品名 + 价值主张）。
   * 结果页（已发送 / 链接失效 / 验证成功）用一枚状态图标替代品牌区，传 false。
   */
  brand?: boolean;
  /**
   * 品牌区是否带价值主张。设计稿 R9「重置密码」只留产品名，
   * 因为此时用户已明确知道自己在这个产品里，不需要再介绍产品是什么。
   */
  slogan?: boolean;
  /** 卡片底部说明（隐私声明 / 兜底提示），不传则不渲染，也不占高度 */
  footer?: ReactNode;
}

/**
 * 认证族卡片外壳（登录 / 注册之外的 R7–R12 共用）
 *
 * 尺寸取自「S1 登录 · 红线标注」并在 R7–R12 补稿中复用：
 * 卡 360 宽 / padding 32 / radius 8 / shadow 0 4px 12px rgba(0,0,0,.10)。
 *
 * 与 `AuthShell` 的分工：AuthShell 管「带 Tab 的登录/注册卡」，
 * 本组件管「无 Tab 的单事卡」。AuthShell 内部复用了它，两处只有一份卡片样式，
 * 后续调视觉不会出现「登录页改了、找回密码页没改」的漂移。
 */
export function AuthCard({ children, brand = true, slogan = true, footer }: AuthCardProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-layout px-4 py-10">
      <div
        className="w-[360px] max-w-full rounded-lg bg-surface p-8"
        style={{ boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)' }}
      >
        {brand && <BrandArea slogan={slogan} />}
        {children}
        {/* 用 div 而非 p：本项目没引 preflight，<p> 自带 1em 上下外边距会把卡片底部撑高 */}
        {footer && (
          <div className="mt-6 text-center text-xs leading-[18px] text-ink-3">{footer}</div>
        )}
      </div>
    </div>
  );
}

/** 品牌区：Logo 48 / 产品名 20-28-600 / 价值主张 12-18 */
export function BrandArea({ slogan = true }: { slogan?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <BrandLogo />
      <div className="mt-3 text-xl leading-7 font-semibold text-ink">{COPY.common.appName}</div>
      {slogan && (
        <div className="mt-1 text-xs leading-[18px] text-ink-3">{COPY.auth.valueProp}</div>
      )}
    </div>
  );
}

/** 品牌图标：48×48 圆角 8 的方块 + 2×2 白色方格（右下角半透明，同设计稿） */
export function BrandLogo() {
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
      <div className="grid grid-cols-2 gap-1">
        <span className="h-3 w-3 rounded-[2px] bg-white" />
        <span className="h-3 w-3 rounded-[2px] bg-white" />
        <span className="h-3 w-3 rounded-[2px] bg-white" />
        <span className="h-3 w-3 rounded-[2px] bg-white/50" />
      </div>
    </div>
  );
}

/**
 * 结果页顶部的状态图标：48 圆形浅色底 + 20 号图标。
 *
 * 设计稿里四种状态各一色（成功绿 / 超时橙 / 失败红 / 已发送蓝），
 * 底色统一用主色 10% 透明度，避免为四种状态各造一个色板变量。
 */
export function StateIcon({
  icon,
  tone = 'primary',
}: {
  icon: ReactNode;
  tone?: 'primary' | 'success' | 'warning' | 'danger';
}) {
  const toneClass = {
    primary: 'text-primary',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
  }[tone];

  return (
    <div className="flex justify-center">
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-full ${toneClass}`}
        style={{ backgroundColor: 'color-mix(in srgb, currentColor 10%, transparent)' }}
      >
        <span className="text-[20px] leading-none">{icon}</span>
      </div>
    </div>
  );
}
