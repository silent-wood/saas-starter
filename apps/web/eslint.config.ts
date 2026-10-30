// ESLint Flat Config（ESLint 9+ 格式）
// 规范依据：_docs/前端开发规范.md §4 代码风格、§15 红线清单
// 加载顺序：js/tseslint 基础规则 → 项目自定义规则 → 文件级豁免 → prettier（必须最后，关闭所有与格式化冲突的规则）
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
export default tseslint.config(
  // 全局忽略：构建产物 / 依赖 / 测试覆盖率报告，不参与 lint
  { ignores: ['dist', 'node_modules', 'coverage'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // ===== 基础规则集 =====
      // react-hooks 官方推荐规则：
      //   rules-of-hooks：Hooks 只能在组件/自定义 Hook 顶层调用（违反会直接导致运行时 bug），error 级
      //   exhaustive-deps：useEffect/useCallback 依赖数组完整性（遗漏依赖会导致闭包读到旧值）
      ...reactHooks.configs.recommended.rules,

      // react-refresh：限制文件「只导出组件」，保证 Vite HMR 热更新边界干净
      // warn 而非 error：误报代价高于漏报；allowConstantExport 允许导出纯常量（不影响 HMR）
      'react-refresh/only-export-components': [
        'warn',
        {
          allowConstantExport: true,
        },
      ],

      // ===== 红线规则（对应规范 §5 / §15，CI 拦截） =====
      // 禁止显式 any：strict 模式只拦「隐式 any」，显式写的 any 需要这条规则拦截。
      // 替代方案：无类型边界用 unknown + 类型收窄（规范 §5）
      '@typescript-eslint/no-explicit-any': 'error',

      // 禁止裸 @ts-ignore / @ts-expect-error 逃避类型检查：
      // allow-with-description 表示「必须带理由注释」才放行，
      // 即 `// @ts-expect-error 理由：xxx`，防止无脑压制报错（规范 §5 / §15）
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': 'allow-with-description', 'ts-expect-error': 'allow-with-description' },
      ],

      // 禁止遗留 console 调试语句：warn 级（非 error），
      // 避免 build 脚本 / 错误上报等合理 console 被误伤；提交前请自行清理 debug 日志
      'no-console': 'warn',
    },
  },
  {
    // 文件级豁免：路由表和守卫文件需要「同时导出组件和常量/工具」
    // （如 router.tsx 导出路由表、RequireAuth.tsx 导出 TOKEN_KEY），
    // 与 react-refresh/only-export-components 的「纯组件文件」约束天然冲突，故对这类文件关闭该规则
    files: ['src/app/router.tsx', 'src/app/guards/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  // 必须放在最后：eslint-config-prettier 关闭所有「与 Prettier 格式化冲突」的 ESLint 规则，
  // 确保格式问题只由 Prettier 负责，两者不打架（规范 §4：Prettier 是格式化唯一来源）
  prettier,
);
