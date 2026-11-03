-- US-048: premium post cover + generated public preview.
-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "cover_media_id" UUID,
ADD COLUMN     "preview_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "posts_preview_key_key" ON "posts"("preview_key");

-- CreateIndex
CREATE INDEX "posts_cover_media_id_idx" ON "posts"("cover_media_id");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_cover_media_id_fkey" FOREIGN KEY ("cover_media_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A media cover always has its generated preview (a dedicated upload sets only preview_key).
ALTER TABLE "posts" ADD CONSTRAINT "posts_cover_has_preview" CHECK ("cover_media_id" IS NULL OR "preview_key" IS NOT NULL);
