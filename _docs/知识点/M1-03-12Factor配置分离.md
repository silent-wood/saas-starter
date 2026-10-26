# M1-03 12-Factor 配置与代码分离

> 知识分类：M1 工程化地基 ｜ 关联里程碑：M1 ｜ 责任视角：后端 / DevOps

## 1. 这是什么
**12-Factor App** 方法论的第三条「Config」：把随环境变化的东西（数据库地址、密钥、域名）从代码里抽出来，放进**环境变量**，代码本身不感知运行环境。

## 2. 为什么值得学
- 这是后端工程的基本功，也是安全底线：把密钥写死在代码里并推到 GitHub，是最高频的**安全事故**。
- 一套代码可在「本地 / 测试 / 生产」之间无缝切换，不碰源码。
- 你作为前端，以前配置多是 `vite.config` 里的常量；理解「配置必须外置」是后端思维的关键一跃。

## 3. 核心概念
- **配置 ≠ 代码**：`.env` 放本地，平台 Secrets 放生产，`.env.example` 进仓库（只有键、没有值）。
- **分层**：`NODE_ENV`、`DATABASE_URL`、`JWT_SECRET`、`REDIS_URL`、第三方 API Key 全部外置。
- **绝不入库**：`.gitignore` 必须忽略 `.env`；密钥泄露后第一时间轮转（revoke）。

## 4. 在本项目如何落地
- 后端 NestJS 用 `@nestjs/config` 读取 `process.env`，启动时校验必填项缺失即报错（fail-fast）。
- 前端用 Vite 的 `import.meta.env.VITE_API_BASE_URL`，构建期注入，不进源码。
- 仓库提供 `.env.example`，标注每个变量的用途与示例值。
- Cloudflare Pages / Render 的控制台里填真实 Secrets，本地用 `.env`。

## 5. 关键代码示例
```ts
// 后端 config 校验（伪代码）
const required = ['DATABASE_URL','JWT_SECRET','REDIS_URL'];
for (const k of required) if (!process.env[k]) throw new Error(`缺失环境变量 ${k}`);
```

## 6. 常见坑
- 把 `.env` 提交进 Git（用 `git-secrets` / 预提交钩子防呆）。
- 前端把密钥打包进客户端——**任何 `VITE_` 开头的变量都会进浏览器包**，绝不放隐私密钥，只放公开的后端 URL。
- 本地能跑、上线报错：往往是生产 Secrets 没配对或平台注入名不一致。

## 7. 验收 / 自测清单
- [ ] 仓库无明文密钥（全局搜一下）
- [ ] `.env.example` 存在且覆盖所有变量
- [ ] 删掉本地 `.env` 后，服务启动因缺变量而明确报错（fail-fast 生效）
- [ ] 前端包里搜不到任何平台密钥

## 8. 延伸学习
- 12-Factor App 官方文档（config / build-release-run / logs）
- 「secrets management」对比：Vault / Doppler / 平台原生 Secrets
