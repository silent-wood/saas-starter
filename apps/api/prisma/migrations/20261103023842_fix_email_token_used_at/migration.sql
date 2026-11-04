-- 1) 修正 email_tokens 列名：schema 侧笔误写成 user_at，语义应为 used_at（已消费时间）
--    用 RENAME 而非 Prisma 默认的 DROP + ADD，保留列数据（当前表为空，但语义正确）
ALTER TABLE "email_tokens" RENAME COLUMN "user_at" TO "used_at";

-- 2) 恢复 pgvector 的 ivfflat 索引（§7.7，M4 语义检索用）
--    来源缺陷：该索引历史上是手工 SQL 建的、不在任何迁移文件里，
--    于是上一个迁移被 Prisma 当作「schema 外的多余索引」自动生成了 DROP INDEX。
--    此处重建并正式纳入迁移历史，保证新环境重放可复现。
CREATE INDEX "idx_ai_chunks_embedding" ON "ai_chunks"
  USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
