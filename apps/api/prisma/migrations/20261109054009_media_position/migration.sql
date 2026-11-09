-- AlterTable
ALTER TABLE "media_assets" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- Backfill (creator-studio US-059): existing media keep the order they have today (created_at, id), per post.
UPDATE "media_assets" AS m
SET "position" = ranked.pos
FROM (
    SELECT "id", (row_number() OVER (PARTITION BY "post_id" ORDER BY "created_at", "id") - 1)::int AS pos
    FROM "media_assets"
) AS ranked
WHERE m."id" = ranked."id";

-- A position is never negative.
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_position_check" CHECK ("position" >= 0);

-- CreateIndex
CREATE INDEX "media_assets_post_id_position_idx" ON "media_assets"("post_id", "position");
