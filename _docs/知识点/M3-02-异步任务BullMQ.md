# M3-02 异步任务（BullMQ 队列）

> 知识分类：M3 存储与异步 ｜ 关联里程碑：M3 ｜ 责任视角：后端 / 架构

## 1. 这是什么
把「慢、可延迟、允许失败重试」的任务（发邮件、AI 处理、生成报表）从 HTTP 请求里摘出来，丢进**消息队列（BullMQ + Redis）**，由后台 worker 异步执行。请求立刻返回「已受理」，任务后台跑。

## 2. 为什么值得学
- 后端铁律：**慢任务不进接口**。接口同步等邮件/AI 会拖垮并发、易超时。
- 理解生产者/消费者、重试、延迟任务——这是分布式系统的基础思维。
- 顺带建立「Redis 不只是缓存，还能做消息中间件」的认知。

## 3. 核心概念
- **生产者**：接口里 `queue.add('sendEmail', payload)`。
- **消费者（Worker）**：独立进程监听队列，处理任务。
- **重试 / 延迟**：任务失败自动按指数退避重试；可设 `delay` 做定时。
- **Upstash Redis**：本项目用免费的 serverless Redis，省去自建实例。

## 4. 在本项目如何落地
- 注册成功后 `emailQueue.add({ to, type:'verify' })` → worker 调 nodemailer 发送。
- AI 文档处理（M4）也走队列：上传后入队 → worker 切分/向量化（耗时），前端轮询/SSE 看进度。
- 失败任务进「死信」并可人工重试。

## 5. 关键代码示例
```ts
// 入队（伪代码）
await this.emailQueue.add('sendEmail',
  { to: user.email, type: 'verify' },
  { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });

// worker（伪代码）
this.emailQueue.process('sendEmail', async (job) => {
  await this.mailer.send(job.data);
});
```

## 6. 常见坑
- 任务体太大塞进 Redis → 占内存；只传 ID，worker 再去 DB 取详情。
- 没设重试导致偶发失败直接丢任务 → 关键任务必须 `attempts`。
- worker 与 api 同进程 → 部署时 worker 没起，任务堆积；需独立起 worker（Render 用同镜像不同命令）。
- 任务幂等没做 → 重试导致邮件发两次（配合 M5-02 幂等键思路）。

## 7. 验收 / 自测清单
- [ ] 发邮件接口瞬间返回，邮件随后到达
- [ ] 人为让发送失败，任务自动重试 3 次
- [ ] worker 独立进程在部署中正常启动
- [ ] 同一任务重试不会产生重复副作用

## 8. 延伸学习
- BullMQ 官方文档（Queue / Worker / Flow）
- 消息队列 vs 定时任务的边界
- 死信队列（Dead Letter Queue）
