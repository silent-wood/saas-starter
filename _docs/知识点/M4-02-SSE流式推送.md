# M4-02 SSE 流式推送（前端打字机）

> 知识分类：M4 AI / RAG ｜ 关联里程碑：M4 ｜ 责任视角：全栈 / 实时

## 1. 这是什么
**SSE（Server-Sent Events）**：服务端通过一条长连接，**增量地**把数据（如 LLM 逐字生成的回答）推给浏览器，前端实时渲染出「打字机」效果。本项目还用 SSE 做**实时通知推送**（v1.1 里实时协作的降级实现）。

## 2. 为什么值得学
- 相比 WebSocket，SSE 是**单向、纯 HTTP、自动重连**，实现简单，特别适合「服务端推、客户端看」的场景。
- 一次学习两处复用：AI 流式回答 + 实时通知，性价比高。
- 理解「流式」思维：不再等接口全返回，而是边产生边展示，用户体验质变。

## 3. 核心概念
- **EventStream**：响应头 `Content-Type: text/event-stream`，数据以 `data: ...\n\n` 分帧。
- **前端 EventSource**：浏览器原生 API，自动重连，无需手动管理 socket。
- **与 WebSocket 区别**：SSE 单向（服务端→客户端）、走标准 HTTP/80-443，利于穿透与 CDN；WS 双向全双工（v2 用）。

## 4. 在本项目如何落地
- AI 问答：`GET /ai/ask/stream?q=...` 返回 SSE，NestJS 用 `StreamableFile` 或响应对象逐块 `res.write()`。
- 实时通知：前端建立一条 SSE 连接订阅「我的租户通知」，新通知到达即推送（替代轮询）。
- 降级：v1 用 SSE + 轮询兜底；v2 升级 Socket.IO 做双向（presence / 协作编辑）。

## 5. 关键代码示例
```ts
// 后端 SSE（伪代码）
@Get('ask/stream')
askStream(@Query('q') q, @Res() res) {
  res.setHeader('Content-Type', 'text/event-stream');
  for await (const chunk of llm.stream(q)) {
    res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
  }
  res.end();
}
```
```ts
// 前端
const es = new EventSource('/ai/ask/stream?q=...');
es.onmessage = (e) => appendText(JSON.parse(e.data).text);
```

## 6. 常见坑
- 忘记 `res.end()` 或没设 `Cache-Control: no-cache` → 代理缓冲导致不实时。
- 跨域 SSE 需 CORS 支持（本项目已规划）；用 Cloudflare 反代可免 CORS（见需求文档）。
- 连接没关闭导致泄漏 → 组件卸载时 `es.close()`。
- 把 SSE 当双向用 → 需要客户端发消息时还是得走普通 POST。

## 7. 验收 / 自测清单
- [ ] AI 回答逐字出现（打字机），而非整段等完
- [ ] 前端收到通知无需刷新页面
- [ ] 组件卸载时 SSE 连接正确关闭
- [ ] 断线后 EventSource 自动重连

## 8. 延伸学习
- MDN EventSource / Server-Sent Events
- SSE vs WebSocket 选型
- 用 ReadableStream 实现流式响应（现代 Node）
