CREATE EXTENSION IF NOT EXISTS vector;
-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'deleted');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('owner', 'admin', 'member');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('active', 'disabled', 'removed');

-- CreateEnum
CREATE TYPE "AiDocStatus" AS ENUM ('processing', 'ready', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" VARCHAR(100) NOT NULL,
    "nickname" VARCHAR(50) NOT NULL,
    "avatar_url" VARCHAR(500),
    "email_verified_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "logo_url" VARCHAR(500),
    "brand_color" VARCHAR(9),
    "owner_id" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'member',
    "status" "MemberStatus" NOT NULL DEFAULT 'active',
    "invited_by" TEXT,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_documents" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "status" "AiDocStatus" NOT NULL DEFAULT 'processing',
    "error_message" VARCHAR(500),
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_chunks" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "token_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "tenants_owner_id_idx" ON "tenants"("owner_id");

-- CreateIndex
CREATE INDEX "memberships_user_id_idx" ON "memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_tenant_id_user_id_key" ON "memberships"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "ai_documents_tenant_id_idx" ON "ai_documents"("tenant_id");

-- CreateIndex
CREATE INDEX "ai_chunks_tenant_id_document_id_idx" ON "ai_chunks"("tenant_id", "document_id");

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chunks" ADD CONSTRAINT "ai_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "ai_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ai_chunks_embedding_idx" ON "ai_chunks" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);