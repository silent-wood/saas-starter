import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { COPY } from '@/constants/copy';

export type AuthMode = 'login' | 'register';

const TABS: ReadonlyArray<{ key: AuthMode; label: string; path: string }> = [
  { key: 'login', label: COPY.auth.tabLogin, path: '/login' },
  { key: 'register', label: COPY.auth.tabRegister, path: '/register' },
];

interface AuthShellProps {
  /** 当前处于哪个 Tab，仅影响选中态与跳转，不影响表单内容 */
  mode: AuthMode;
  /** 卡片底部的隐私声明（登录 / 注册文案不同） */
  privacy: string;
  children: ReactNode;
}

/**
 * 认证页外壳：还原设计稿 S1「登录」画板
 *
 * 设计稿只有一个画板 + 两个 Tab（登录 / 注册），所以登录和注册共用这张卡片，
 * Tab 负责在 /login 与 /register 之间切换 —— 视觉上是一张卡，路由上仍是两个页面
 * （邮件链接直达、方案文档 F-05/F-07、现有测试都依赖独立路由）。
 *
 * 尺寸全部来自「S1 登录 · 红线标注」：卡 360 宽 / padding 32 / radius 8 /
 * shadow 0 4px 12px rgba(0,0,0,.10)；Logo 48；Tab 高 32 下划线 2px；段间距 24。
 */
export function AuthShell({ mode, privacy, children }: AuthShellProps) {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-layout px-4 py-10">
      <div
        className="w-[360px] max-w-full rounded-lg bg-surface p-8"
        style={{ boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)' }}
      >
        {/* 品牌区：Logo 48 / 产品名 20-28-600 / 价值主张 12-18 */}
        <div className="flex flex-col items-center">
          <BrandLogo />
          <div className="mt-3 text-xl leading-7 font-semibold text-ink">{COPY.common.appName}</div>
          <div className="mt-1 text-xs leading-[18px] text-ink-3">{COPY.auth.valueProp}</div>
        </div>

        {/* Tab：高 32，选中 600 + 2px 下划线，未选中 #8C8C8C
            注意：本项目没引 Tailwind preflight，浏览器对 <button> 的默认边框仍在，
            所以必须显式 border-0；下划线用绝对定位的 span，避免与 border-* 工具类争优先级。 */}
        <div role="tablist" className="mt-6 flex">
          {TABS.map((tab) => {
            const active = tab.key === mode;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => navigate(tab.path)}
                className={`relative h-8 flex-1 cursor-pointer border-0 bg-transparent p-0 text-sm leading-[22px] ${
                  active ? 'font-semibold text-primary' : 'text-ink-3'
                }`}
              >
                {tab.label}
                {active && (
                  <span
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-primary"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-6">{children}</div>

        {/* 用 div 而非 p：本项目没引 preflight，<p> 自带 1em 上下外边距会把卡片底部撑高 */}
        <div className="mt-6 text-center text-xs leading-[18px] text-ink-3">{privacy}</div>
      </div>
    </div>
  );
}

/** 品牌图标：48×48 圆角 8 的方块 + 2×2 白色方格（右下角半透明，同设计稿） */
function BrandLogo() {
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
