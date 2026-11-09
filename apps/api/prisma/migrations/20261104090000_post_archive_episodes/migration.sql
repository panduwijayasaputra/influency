-- US-047: HIDDEN becomes ARCHIVED (rename keeps existing rows) + append-only archive episodes. Hand-written:
-- Prisma would drop and recreate the enum. Legacy HIDDEN posts get an open episode at updated_at (dev data only;
-- they may have been edited while hidden).
ALTER TYPE "post_status" RENAME VALUE 'HIDDEN' TO 'ARCHIVED';

-- CreateTable
CREATE TABLE "post_archive_episodes" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "post_id" UUID NOT NULL,
    "archived_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restored_at" TIMESTAMPTZ(3),

    CONSTRAINT "post_archive_episodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "post_archive_episodes_post_id_archived_at_idx" ON "post_archive_episodes"("post_id", "archived_at");

-- AddForeignKey
ALTER TABLE "post_archive_episodes" ADD CONSTRAINT "post_archive_episodes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- At most one open episode per post; restore closes it exactly once.
CREATE UNIQUE INDEX "post_archive_episodes_one_open" ON "post_archive_episodes"("post_id") WHERE "restored_at" IS NULL;
ALTER TABLE "post_archive_episodes" ADD CONSTRAINT "post_archive_episodes_restored_after_archived"
  CHECK ("restored_at" IS NULL OR "restored_at" >= "archived_at");

INSERT INTO "post_archive_episodes" ("post_id", "archived_at")
SELECT "id", "updated_at" FROM "posts" WHERE "status" = 'ARCHIVED';
