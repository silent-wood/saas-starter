# M1-01 Monorepo 治理（pnpm workspace + Turborepo）

> 知识分类：M1 工程化地基 ｜ 关联里程碑：M1 ｜ 责任视角：全栈 / 工程化

## 1. 这是什么
把「前端应用、后端应用、共享代码」放进**一个仓库**，用工作区（workspace）工具统一管理依赖与构建，而不是拆成多个仓库。

## 2. 为什么值得学
- 现代中大型前端 / 全栈团队的**主流工程形态**，JD 里常写「熟悉 monorepo」。
- 解决多仓库最痛的两点：**前后端接口类型漂移**（一份类型两处用）、**重复装包与重复构建**。
- 作品集里一个仓库就是一件完整作品，且能展示工程素养。

## 3. 核心概念
- **pnpm workspace**：跨包共享 `node_modules`，节省磁盘与安装时间，严格依赖隔离。
- **Turborepo**：基于依赖图的**任务编排**与**构建缓存**（命中缓存秒级跳过），`turbo run build` 只构建受影响包。
- **包（package）边界**：`apps/web`（前端）、`apps/api`（后端）、`packages/shared`（共享类型/常量）。

## 4. 在本项目如何落地
```
saas-starter/
├─ apps/web/      # Vite + React 前端
├─ apps/api/      # NestJS 后端
├─ packages/shared/  # 前后端共享 DTO / 枚举 / 错误码
├─ package.json   # 根：workspace 声明 + turbo 配置
├─ pnpm-workspace.yaml
└─ turbo.json
```
- `pnpm-workspace.yaml` 声明哪些目录是包。
- `shared` 通过 `"@saas/shared": "workspace:*"` 被 web/api 引用，类型零拷贝同步。
- 根 `turbo.json` 定义 `build / lint / test` 任务及其依赖关系。

## 5. 关键配置（伪代码）
```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```
```json
// turbo.json 摘要
{
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "lint": {},
    "test": {}
  }
}
```

## 6. 常见坑
- 忘了在根 `package.json` 声明 `"private": true`，导致 pnpm 拒绝 workspace 根。
- `shared` 被改了但 web/api 没重装 / 没重建 → 类型不同步；CI 里务必 `pnpm install` 后再 build。
- Turborepo 缓存踩坑：改了环境变量但缓存命中导致不重建 → 用 `--force` 或正确声明 `inputs`。

## 7. 验收 / 自测清单
- [ ] 一个仓库里 `pnpm install` 一次即装全量依赖
- [ ] `pnpm -F @saas/shared build` 产出类型，web/api 能 `import` 到
- [ ] `turbo run build` 能按依赖顺序构建三个包
- [ ] 修改 shared 类型，前端编译期立刻报错（契约同源生效）

## 8. 延伸学习
- pnpm 官方文档（workspace）
- Turborepo 官方「Core Concepts」
- 对比：对比 npm/yarn workspace 与 pnpm 的区别
