-- AlterTable
ALTER TABLE "media_assets" ADD COLUMN     "duration_seconds" INTEGER,
ADD COLUMN     "video_uid" TEXT,
ALTER COLUMN "object_key" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_video_uid_key" ON "media_assets"("video_uid");


-- IMAGE rows reference an object, VIDEO rows a provider video; never both.
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_storage_ref" CHECK (
  ("kind" = 'IMAGE' AND "object_key" IS NOT NULL AND "video_uid" IS NULL) OR
  ("kind" = 'VIDEO' AND "video_uid" IS NOT NULL AND "object_key" IS NULL));
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_duration_seconds" CHECK ("duration_seconds" IS NULL OR "duration_seconds" >= 0);
