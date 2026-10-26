# M4-01 RAG 全链路（切分 → 向量 → 检索 → 生成）

> 知识分类：M4 AI / RAG ｜ 关联里程碑：M4 ｜ 责任视角：全栈 / AI 工程

## 1. 这是什么
**RAG（检索增强生成）**：让 LLM 基于「你租户自己的文档」回答问题。链路是：上传文档 → 切成片段 → 向量化（embedding）→ 存进向量库（pgvector）→ 用户提问时把问题也向量化 → 检索最相似的片段 → 连同问题一起喂给 LLM 生成答案，并附引用来源。

## 2. 为什么值得学
- 当下**全栈岗最具区分度**的能力，简历辨识度极高。
- 你用一个 Postgres（pgvector）就完成了「文档检索 + 语义搜索」，无需额外向量库，学习聚焦。
- 理解 embedding 与语义相似度，是从「调 API」到「懂 AI 原理」的跨越。

## 3. 核心概念
- **Embedding**：把文本变成高维向量，语义相近的文本向量距离近。
- **pgvector**：Postgres 扩展，存向量 + 做余弦相似度检索，一条 SQL 搞定。
- **切分（Chunking）**：文档按段落/固定 token 切，太大检索不准、太小丢上下文。
- **检索增强**：只把相关片段喂给 LLM，避免幻觉、答案有出处。

## 4. 在本项目如何落地
- 上传经 M3 队列异步处理：`extract → chunk → embed(调用 embedding API) → 存 DocumentChunk 表（含向量列）`。
- 提问：`embed(question) → 相似度查询 topK → 拼成 prompt → LLM 流式回答（见 M4-02）→ 返回引用片段 ID`。
- 隔离：DocumentChunk 带 tenantId，检索只限本租户（呼应 M2-03）。

## 5. 关键代码示例
```sql
-- pgvector 相似度检索（伪代码）
SELECT content, 1 - (embedding <=> $1) AS score
FROM "DocumentChunk"
WHERE "tenantId" = $2
ORDER BY embedding <=> $1
LIMIT 5;
```

## 6. 常见坑
- 切分不考虑语义边界 → 一段话被腰斩，检索质量差。按标题/段落切更好。
- 没有 tenantId 过滤 → 跨租户泄露知识（高危，复用 M2-03）。
- 检索 topK 过多 → 喂太多噪声给 LLM；过少 → 答非所问。需调参。
- 向量维度与 embedding 模型不一致 → 报错；模型换了要重建索引。

## 7. 验收 / 自测清单
- [ ] 上传 PDF/文档后能在管理页看到「已向量化」状态
- [ ] 提问返回的答案引用了文档原文片段
- [ ] 租户 B 问不到租户 A 的文档内容
- [ ] 超长文档被合理切分且可检索

## 8. 延伸学习
- LangChain / Vercel AI SDK 的 RAG 管线
- Embedding 模型选型（维度、成本、语言支持）
- 混合检索（向量 + 关键词 BM25）
