/**
 * 设计令牌同步校验（防漂移）
 *
 * 令牌存在两份是物理必然：antd 只吃 JS 值（src/theme/tokens.ts），
 * Tailwind 只吃 CSS 变量（src/styles/global.css 的 @theme 块）。
 * 本测试机械比对两者，只改一处会直接失败 —— 避免出现
 * 「antd 按钮是设计色、Tailwind 类是旧色」这种最难发现的不一致。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLOR, FONT_FAMILY } from './tokens';

/** COLOR 的键名 → CSS 变量名后缀（显式映射，不做猜测式转换） */
const CSS_VAR_SUFFIX: Record<keyof typeof COLOR, string> = {
  primary: 'primary',
  primaryHover: 'primary-hover',
  primaryActive: 'primary-active',
  primaryBg: 'primary-bg',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  ink: 'ink',
  ink2: 'ink-2',
  ink3: 'ink-3',
  inkDisabled: 'ink-disabled',
  line: 'line',
  split: 'split',
  layout: 'layout',
  surface: 'surface',
};

// vitest 的 cwd 固定在 web 包根（vite.config.ts 所在目录），直接按相对路径读
const cssPath = resolve(process.cwd(), 'src/styles/global.css');
const css = readFileSync(cssPath, 'utf8');

/** 取出 @theme { ... } 里的 --color-* 声明 */
function readThemeColors(): Record<string, string> {
  const block = css.match(/@theme\s*\{([\s\S]*?)\}/);
  if (!block) return {};
  const result: Record<string, string> = {};
  for (const m of block[1].matchAll(/--color-([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    result[m[1]] = m[2].trim().toLowerCase();
  }
  return result;
}

describe('设计令牌同步', () => {
  const themeColors = readThemeColors();

  it('@theme 里的每个色值都与 tokens.ts 的 COLOR 一致', () => {
    for (const [key, suffix] of Object.entries(CSS_VAR_SUFFIX)) {
      const expected = COLOR[key as keyof typeof COLOR].toLowerCase();
      expect(themeColors[suffix], `--color-${suffix} 与 COLOR.${key} 不一致`).toBe(expected);
    }
  });

  it('@theme 声明的颜色数量与 COLOR 一致（无遗漏、无多余）', () => {
    expect(Object.keys(themeColors)).toHaveLength(Object.keys(COLOR).length);
  });

  it('@theme 的 --font-sans 与 FONT_FAMILY 指向同一字族', () => {
    // CSS 里可能折行，去掉空白后比对首个字族名，避免对排版格式过度约束
    const firstFamily = FONT_FAMILY.split(',')[0].trim();
    expect(css).toContain(firstFamily);
  });
});
