-- CreateTable
CREATE TABLE "resources" (
    "id" TEXT NOT NULL,
    "tenant_id" VARCHAR(32) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(50),
    "created_by" VARCHAR(32) NOT NULL,
    "deleted_by" VARCHAR(32),
    "deleted_at" TIMESTAMP(3),
    "purged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resources_tenant_id_deleted_at_idx" ON "resources"("tenant_id", "deleted_at");

-- CreateIndex
CREATE INDEX "resources_tenant_id_category_idx" ON "resources"("tenant_id", "category");

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
