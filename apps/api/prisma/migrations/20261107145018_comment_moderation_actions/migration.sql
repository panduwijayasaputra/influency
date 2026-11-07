-- CreateEnum
CREATE TYPE "comment_moderation_actor" AS ENUM ('CREATOR', 'ADMIN');

-- CreateTable
CREATE TABLE "comment_moderation_actions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "comment_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "actor_role" "comment_moderation_actor" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "comment_moderation_actions_comment_id_key" ON "comment_moderation_actions"("comment_id");

-- CreateIndex
CREATE INDEX "comment_moderation_actions_post_id_created_at_idx" ON "comment_moderation_actions"("post_id", "created_at");

-- CreateIndex
CREATE INDEX "comment_moderation_actions_actor_id_created_at_idx" ON "comment_moderation_actions"("actor_id", "created_at");

-- AddForeignKey
ALTER TABLE "comment_moderation_actions" ADD CONSTRAINT "comment_moderation_actions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "post_comments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_moderation_actions" ADD CONSTRAINT "comment_moderation_actions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_moderation_actions" ADD CONSTRAINT "comment_moderation_actions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
