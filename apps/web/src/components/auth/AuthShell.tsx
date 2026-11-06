import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { AuthCard } from './AuthCard';
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
 * 卡片本体（360 宽 / padding 32 / radius 8 / shadow）由 `AuthCard` 提供，
 * 与 R7–R12 的单事卡共用同一份尺寸；本文件只负责「Tab 这一层」。
 */
export function AuthShell({ mode, privacy, children }: AuthShellProps) {
  const navigate = useNavigate();

  return (
    <AuthCard footer={privacy}>
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
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-6">{children}</div>
    </AuthCard>
  );
}
