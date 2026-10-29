// commitlint 配置：校验提交消息格式（Conventional Commits，见 _docs/前端开发规范.md §13）
// 触发时机：git commit 时由 commit-msg hook 调用（simple-git-hooks 接线）
// 手动校验已有提交：pnpm exec commitlint --from HEAD~5 --to HEAD
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // header 总长度上限放宽到 120（默认 100）：中文提交描述信息密度高，100 容易不够用
    "header-max-length": [2, "always", 120],
    // scope 建议取值（warn 级不强制）：留空不校验，写了才检查是否在枚举内
    "scope-enum": [1, "always", ["web", "shared", "api", "docs", "deps", "repo"]],
  },
};
