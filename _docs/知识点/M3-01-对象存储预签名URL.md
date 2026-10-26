# M3-01 对象存储与预签名 URL 直传

> 知识分类：M3 存储与异步 ｜ 关联里程碑：M3 ｜ 责任视角：后端 / 存储

## 1. 这是什么
用户上传文件（头像、附件）时，**不让文件流经你的后端服务器**，而是由前端直接向对象存储（Cloudflare R2 / S3 兼容）上传，后端只负责「签发一张限时上传凭证（预签名 URL）」。文件元数据（URL、大小、归属租户）写进数据库。

## 2. 为什么值得学
- 生产环境文件处理的标准姿势；否则大文件会拖垮你的 API 服务、占满带宽。
- 理解「凭证签发」与「资源访问」分离的安全模型（最小权限、限时有效）。
- 你作为前端，这次要反过来设计「后端如何给前端开上传权限」，视角互补。

## 3. 核心概念
- **S3 兼容**：R2 / MinIO / 阿里 OSS 都遵循 S3 API，一套代码多厂商可换。
- **预签名 URL（Presigned URL）**：后端用密钥生成一个带过期时间的上传地址，前端 PUT 直传。密钥从不下发浏览器。
- **直传 vs 中转**：直传省服务器带宽与计算；中转适合需要做病毒扫描/转码的场景。

## 4. 在本项目如何落地
- 前端请求 `POST /files/presign` → 后端校验登录与配额 → 用 R2 SDK 生成 5 分钟有效 PUT URL 与 key。
- 前端拿到 URL 直接 PUT 文件；成功后回调 `POST /files/confirm` 让后端入库元数据。
- 文件 key 内嵌 `tenantId` 前缀，天然隔离（备份 M2-03）。

## 5. 关键代码示例
```ts
// 后端签发（伪代码）
const key = `${tenantId}/${crypto.randomUUID()}-${filename}`;
const url = await r2.signPutUrl(key, { expiresIn: 300 });
return { url, key };
```

## 6. 常见坑
- 预签名 URL 过期时间太长 → 被人拿去乱传；太短 → 大文件传不完。按文件大小调。
- key 没带 tenantId 前缀 → 租户间文件可被猜 URL 访问；需配合存储桶策略或私有访问。
- 直传成功但后端 confirm 失败 → 出现「孤儿文件」；需定期清理未确认 key。
- 前端把存储 secret 写进代码 → 重大泄露（secret 永远只在后端）。

## 7. 验收 / 自测清单
- [ ] 上传不经过后端 body（Network 里看到 PUT 到 R2 域名）
- [ ] 预签名 URL 过期后不可再用
- [ ] 文件元数据入库且归属正确租户
- [ ] 仓库/前端包无存储密钥

## 9. 可选增强：大文件分片上传（Multipart Upload）

当文件超过预签名单 PUT 的舒适区（本项目演示限制 10MB，生产常设 100MB~5GB 上限），单 URL 直传的**过期窗口难兼顾**（太长有安全风险、太短传不完）且一旦失败需整文件重传。此时升级为**分片上传**。

**核心流程（S3 / R2 原生 Multipart API）**
1. 前端向后端申请 `POST /files/multipart/init`，后端用 SDK 调 `createMultipartUpload` 拿到 `uploadId` 与目标 `key`，返回给前端。
2. 前端把文件切为固定大小分片（如 5MB~10MB），对每个分片请求后端签**分片级预签名 URL**（`uploadPart`），并发 PUT 各分片，收集每个分片返回的 `ETag`。
3. 全部完成后前端调用 `POST /files/multipart/complete`，后端用 `uploadId + 各 ETag` 调 `completeMultipartUpload` 合并为完整对象。
4. 失败/放弃时调 `abortMultipartUpload` 清理已传分片，避免产生「半成品」与费用。

**能力加成（生产必备，可选实现）**
- **断点续传**：前端把 `uploadId`、各分片上传状态存 IndexedDB；刷新/断网后查询 `listParts` 已传分片，只补传未完成部分。
- **进度与并发**：展示总进度（已传分片 / 总分片），分片并发上传（限 3~5 路）提速。
- **秒传 / 去重**：上传前算文件 hash，后端已存在则直接引用（演示级可不做）。

**关键代码示例（伪代码）**
```ts
// 后端：初始化 + 签分片 + 合并
const { uploadId, key } = await r2.createMultipartUpload(tenantKey, mime);
// 签第 i 片（5 分钟有效）
const partUrl = await r2.signUploadPart(key, uploadId, partNumber, { expiresIn: 300 });
// 合并
await r2.completeMultipartUpload(key, uploadId, parts /* [{ETag,PartNumber}] */);
```
```ts
// 前端：切分并发 + 续传
const parts = chunkFile(file, 8 * 1024 * 1024); // 每片 8MB
const etags = await Promise.all(parts.map((p, i) =>
  fetch(partUrls[i], { method: 'PUT', body: p }).then(r => r.headers.get('ETag'))));
await api.completeMultipart({ uploadId, key, parts: etags.map((e,i)=>({PartNumber:i+1,ETag:e})) });
```

**常见坑**
- 分片大小 < 5MB（R2/S3 最低要求）→ 合并报错；最后一片可小于 5MB，其余必须 ≥ 5MB。
- `completeMultipartUpload` 的 `PartNumber` 必须连续且 ETag 与实际上传一致 → 顺序错乱会失败。
- 只 init 不上传/不 complete/不 abort → 产生未完成分片占用存储与费用；需定时清理。
- 并发过高打满浏览器/网络 → 限并发（如 4 路）+ 单分片失败重试。

## 10. 延伸学习
- AWS S3 Presigned URL / Multipart Upload 官方文档
- 前端大文件上传库（如 `tus` 断点续传协议、uppy）
- CDN 加速与缓存策略
