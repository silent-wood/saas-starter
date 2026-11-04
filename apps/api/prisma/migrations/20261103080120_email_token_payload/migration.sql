/*
  Warnings:

  - Added the required column `payload` to the `email_tokens` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "idx_ai_chunks_embedding";

-- AlterTable
ALTER TABLE "email_tokens" ADD COLUMN     "payload" JSONB NOT NULL;
