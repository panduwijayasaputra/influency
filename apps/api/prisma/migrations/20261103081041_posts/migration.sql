-- CreateEnum
CREATE TYPE "post_visibility" AS ENUM ('FREE', 'PREMIUM');

-- CreateEnum
CREATE TYPE "post_status" AS ENUM ('DRAFT', 'PROCESSING', 'PENDING_REVIEW', 'PUBLISHED', 'HIDDEN', 'REMOVED');

-- CreateTable
CREATE TABLE "posts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "creator_profile_id" UUID NOT NULL,
    "visibility" "post_visibility" NOT NULL,
    "status" "post_status" NOT NULL DEFAULT 'DRAFT',
    "caption" TEXT NOT NULL DEFAULT '',
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "posts_creator_profile_id_created_at_idx" ON "posts"("creator_profile_id", "created_at");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_creator_profile_id_fkey" FOREIGN KEY ("creator_profile_id") REFERENCES "creator_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Caption limit mirrors POST_CAPTION_MAX_LENGTH (placeholder) so a bypassed API can't store more.
ALTER TABLE "posts" ADD CONSTRAINT "posts_caption_length" CHECK (char_length("caption") <= 2000);
