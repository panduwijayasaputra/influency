-- US-049: why a media upload failed (shown in the studio) + stale-upload sweep index.
-- CreateEnum
CREATE TYPE "media_rejection_reason" AS ENUM ('UPLOAD_EXPIRED', 'PROCESSING_TIMEOUT', 'PROCESSING_FAILED', 'TOO_LARGE', 'TOO_LONG', 'UNSUPPORTED_TYPE');

-- AlterTable
ALTER TABLE "media_assets" ADD COLUMN     "rejection_reason" "media_rejection_reason";

-- CreateIndex
CREATE INDEX "media_assets_status_upload_expires_at_idx" ON "media_assets"("status", "upload_expires_at");

-- A reason only on REJECTED rows; rows rejected before US-049 keep a null reason.
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_rejection_reason_status" CHECK ("rejection_reason" IS NULL OR "status" = 'REJECTED');
