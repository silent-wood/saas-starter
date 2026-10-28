# SaaS Starter

多租户中后台 SaaS 全栈脚手架 —— 一个可复用、可演示、覆盖全栈关键能力的工程基座。用作技术作品集与真实业务落地的起点。

> 版本：v0.2（文档先行，代码随里程碑落地）｜ 更新：2026-10-26
> 状态：M1–M6 未开始（见下方路线图）

## 核心特性

- **多租户**：注册即建租户，行级数据隔离（`tenant_id`），注册 / 邀请 / 角色分配
- **认证与 RBAC**：JWT 双令牌、bcrypt 哈希、owner / admin / member 三级角色、按钮级权限
- **成员生命周期**：待激活 / 禁用 / 移除 / owner 转让，全程留痕
- **业务域 CRUD**：示例「工作区资源」实体，分页 / 过滤 / **软删除回收站（30 天可恢复）**
- **文件存储**：S3 兼容对象存储（腾讯云 COS），元数据入库
- **AI 智能问答（RAG）**：文档上传 → 切分向量化（pgvector）→ 语义检索 → LLM 流式回答（SSE），带引用来源
- **订阅支付（模拟网关 · 内容完整版）**：套餐 / 14 天试用 / 订阅状态机（宽限期/取消/退款）/**资金安全三件套（幂等 + 对账 + 资损监控，模拟执行）** / 账单中心 / 权益联动；MockPaymentGateway 策略模式预留真实网关接入位
- **用量与配额**：席位 / 存储 / AI 次数看板与超额策略
- **消息通知**：邮件（验证 / 重置 / 订阅 / 告警）+ 站内通知中心（SSE 实时推送）+ 通知偏好；短信通道模拟
- **实时协作（降级实现）**：变更提示 + 通知实时推送（SSE）；WebSocket 全双工列入 v2
- **审计日志 / 租户设置**：敏感操作留痕（180 天）、租户品牌化配置
- **部署与 CI/CD**：Cloudflare Pages（前端）+ Render/Railway（后端）+ GitHub Actions，境外免备案

## 技术栈（概要）

| 层 | 技术 |
|----|------|
| 前端 | Vite · React 19 · Ant Design 5 · Zustand · TanStack Query · React Hook Form + Zod |
| 后端 | Node 20 LTS · NestJS 11 · Prisma 6 · PostgreSQL（Neon）+ pgvector |
| 异步 / 缓存 | BullMQ + Upstash Redis |
| 存储 / 邮件 / AI | 腾讯云 COS · nodemailer/Resend · Vercel AI SDK |
| 工程 | pnpm workspace + Turborepo（Monorepo）· GitHub Actions · Vitest + Supertest |

完整选型与版本见 `_docs/需求文档.md` 第 3 章（构建前以官方最新稳定版复核）。实时推送（SSE）由 NestJS 原生响应流实现，无额外依赖；WebSocket（v2）届时引入 Socket.IO。

## 仓库结构（规划）

```
saas-starter/
├─ apps/
│  ├─ web/        # 前端 Vite SPA（部署 Cloudflare Pages）
│  └─ api/        # 后端 NestJS（部署 Render/Railway）
├─ packages/
│  └─ shared/     # 前后端共享类型 / 校验
├─ _docs/         # 项目文档
├─ .github/workflows/
├─ package.json / turbo.json / pnpm-workspace.yaml
└─ README.md
```

## 快速开始（本地）

> ⚠️ 以下命令为**规划值**（PM 视角整理），以工程侧脚手架实际落地为准、随 M1 校准；细节见 `_docs/` 部署运维手册（待产出）。

**环境要求**：Node.js ≥ 20 LTS、pnpm ≥ 9、Git；本地可选用 Docker 运行 Postgres（或直接使用 Neon 云端库）。

```bash
# 1. 安装依赖（monorepo 根目录）
pnpm install

# 2. 配置环境变量（复制示例文件并填入本地值）
cp apps/api/.env.example apps/api/.env
#   必填：DATABASE_URL、JWT_SECRET 等（变量清单见 .env.example）

# 3. 初始化数据库
pnpm --filter api prisma migrate dev

# 4. 启动
pnpm --filter api dev        # 后端 http://localhost:3000
pnpm --filter web dev        # 前端 http://localhost:5173
```

启动后：前端访问 http://localhost:5173 ；接口文档（Swagger）由后端自动生成。

## 路线图（里程碑）

- [ ] **M1** Monorepo 骨架 + 前端静态页 + 后端健康检查
- [ ] **M2** 认证 + 多租户 + 基线 CRUD + RBAC + 成员生命周期 + 审计日志
- [ ] **M3** 文件存储 + 消息通知（邮件）+ 通知偏好 + 软删除回收站 + 租户设置
- [ ] **M4** AI 模块（RAG）+ 用量配额
- [ ] **M5** 订阅支付完整化（状态机/资金三件套/账单）+ 实时协作 SSE 降级
- [ ] **M6** 部署上线 + 端到端验证（含跨租户越权、资金三件套演练）

## 许可

MIT（开源脚手架，可自由复用；上线真实业务前请完成合规审查）。
