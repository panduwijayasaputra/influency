-- Post comments (US-052). Soft delete only; hand-edited to add the CHECKs below.
-- CreateTable
CREATE TABLE "post_comments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by_user_id" UUID,

    CONSTRAINT "post_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "post_comments_post_id_id_idx" ON "post_comments"("post_id", "id");

-- CreateIndex
CREATE INDEX "post_comments_user_id_created_at_idx" ON "post_comments"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "post_comments_deleted_by_user_id_idx" ON "post_comments"("deleted_by_user_id");

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_deleted_by_user_id_fkey" FOREIGN KEY ("deleted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- POST_COMMENT_MAX_LENGTH (packages/shared comments.ts)
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_body_length" CHECK (char_length("body") BETWEEN 1 AND 500);

-- deleted_at and deleted_by_user_id are set together
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_deleted_consistent" CHECK (("deleted_at" IS NULL) = ("deleted_by_user_id" IS NULL));
