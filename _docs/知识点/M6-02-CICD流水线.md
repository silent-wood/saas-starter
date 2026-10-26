# M6-02 CI/CD 流水线（GitHub Actions）

> 知识分类：M6 部署与运维 ｜ 关联里程碑：M6 ｜ 责任视角：DevOps / 全栈

## 1. 这是什么
**CI/CD（持续集成 / 持续交付）**：代码推到 GitHub 后，**自动**跑 lint → test → build → deploy，无需手动打包上传。把「人肉发布」变成「推代码即上线」的可靠流水线。

## 2. 为什么值得学
- 自动化交付是团队协作的基石，也是现代工程素养的标配项。
- 你以前可能只用 Git 存代码；理解 CI 如何串起质量门禁（测试不过不发布）是进阶。
- 本项目 Monorepo 下一条流水线分别部署前后端，是很好的实践样本。

## 3. 核心概念
- **CI（集成）**：每次 push/PR 自动 lint + 测试，保证主干可构建。
- **CD（交付）**：测试通过后自动部署到 Pages / Render。
- **流水线（Workflow）**：GitHub Actions 的 YAML，定义 job 与 step。
- **质量门禁**：测试失败则阻断部署，防止坏代码上线。

## 4. 在本项目如何落地
- 两个 workflow（或一文件多 job）：`deploy-web`（构建 apps/web → 部署 Cloudflare Pages）、`deploy-api`（构建 apps/api → `prisma migrate deploy` → 部署 Render）。
- 触发：push 到 main 分支。PR 时只跑 lint+test 不部署。
- Secrets：DATABASE_URL / JWT_SECRET 等存仓库 Secrets，构建期注入。

## 5. 关键代码示例（伪 YAML）
```yaml
# .github/workflows/deploy.yml（摘要）
on: { push: { branches: [main] } }
jobs:
  web:
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install && pnpm -F web build
      - uses: cloudflare/pages-action@v1   # 部署到 Pages
  api:
    needs: web
    steps:
      - run: pnpm install && pnpm -F api build
      - run: pnpm -F api exec prisma migrate deploy  # 先迁移
      - uses: render/deploy-action@v1                 # 部署 Render
```

## 6. 常见坑
- 忘了先 migrate 就部署新代码 → 结构不一致（见 M6-01）。
- Secrets 没配置 → 构建期读不到 DATABASE_URL 直接失败。
- 测试没写或总挂 → CI 永远红，团队放弃 CI（门禁形同虚设）。
- Monorepo 下全量构建慢 → 用 Turborepo 缓存只构建受影响包。

## 7. 验收 / 自测清单
- [ ] push 到 main 后自动部署前后端，无需手动
- [ ] 故意让测试失败，部署被阻断
- [ ] 数据库迁移在部署步骤中正确执行
- [ ] Secrets 不出现在日志与代码里

## 8. 延伸学习
- GitHub Actions 官方文档
- Cloudflare Pages / Render Deploy Action
- 流水线缓存与并行化提速
