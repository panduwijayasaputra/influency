-- AlterTable
ALTER TABLE "post_comments" ADD COLUMN     "pinned_at" TIMESTAMPTZ(3);

-- US-020: one pinned comment per post, top-level only.
CREATE UNIQUE INDEX "post_comments_one_pinned_per_post" ON "post_comments"("post_id") WHERE "pinned_at" IS NOT NULL;
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_pinned_top_level" CHECK ("pinned_at" IS NULL OR "parent_id" IS NULL);
