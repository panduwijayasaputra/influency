-- AlterTable
ALTER TABLE "post_comments" ADD COLUMN     "like_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "parent_id" UUID;

-- CreateIndex
CREATE INDEX "post_comments_parent_id_id_idx" ON "post_comments"("parent_id", "id");

-- CreateIndex
CREATE INDEX "post_comments_post_id_like_count_id_idx" ON "post_comments"("post_id", "like_count" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "post_comments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- US-017: like_count never negative; a comment is never its own parent.
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_like_count_nonneg" CHECK ("like_count" >= 0);
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_parent_not_self" CHECK ("parent_id" IS NULL OR "parent_id" <> "id");
