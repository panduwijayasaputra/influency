-- Report content & moderation queue (US-042). Hand-edited to add the partial indexes and CHECKs below.
-- CreateEnum
CREATE TYPE "post_report_reason" AS ENUM ('SPAM', 'SEXUAL_CONTENT', 'VIOLENCE', 'HARASSMENT', 'ILLEGAL', 'COPYRIGHT', 'OTHER');

-- CreateEnum
CREATE TYPE "moderation_action_type" AS ENUM ('DISMISS', 'HIDE', 'UNHIDE', 'REMOVE', 'SUSPEND_USER', 'UNSUSPEND_USER');

-- CreateTable
CREATE TABLE "moderation_actions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "admin_id" UUID NOT NULL,
    "action" "moderation_action_type" NOT NULL,
    "post_id" UUID,
    "target_user_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_reports" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "post_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reason" "post_report_reason" NOT NULL,
    "note" TEXT,
    "resolved_by_action_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moderation_actions_admin_id_idx" ON "moderation_actions"("admin_id");

-- CreateIndex
CREATE INDEX "moderation_actions_post_id_created_at_idx" ON "moderation_actions"("post_id", "created_at");

-- CreateIndex
CREATE INDEX "moderation_actions_target_user_id_created_at_idx" ON "moderation_actions"("target_user_id", "created_at");

-- CreateIndex
CREATE INDEX "post_reports_post_id_created_at_idx" ON "post_reports"("post_id", "created_at");

-- CreateIndex
CREATE INDEX "post_reports_reporter_id_idx" ON "post_reports"("reporter_id");

-- CreateIndex
CREATE INDEX "post_reports_resolved_by_action_id_idx" ON "post_reports"("resolved_by_action_id");

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_reports" ADD CONSTRAINT "post_reports_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_reports" ADD CONSTRAINT "post_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_reports" ADD CONSTRAINT "post_reports_resolved_by_action_id_fkey" FOREIGN KEY ("resolved_by_action_id") REFERENCES "moderation_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One open report per (post, reporter); a resolved report frees the slot for a new one.
CREATE UNIQUE INDEX "post_reports_one_open" ON "post_reports"("post_id", "reporter_id") WHERE "resolved_by_action_id" IS NULL;

-- Moderation queue scan over open reports.
CREATE INDEX "post_reports_open_created_at_idx" ON "post_reports"("created_at") WHERE "resolved_by_action_id" IS NULL;

-- MODERATION_NOTE_MAX_LENGTH (packages/shared moderation.ts)
ALTER TABLE "post_reports" ADD CONSTRAINT "post_reports_note_length" CHECK ("note" IS NULL OR char_length("note") <= 500);
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_note_length" CHECK ("note" IS NULL OR char_length("note") <= 500);

-- Reason OTHER needs an explanation.
ALTER TABLE "post_reports" ADD CONSTRAINT "post_reports_other_has_note" CHECK ("reason" <> 'OTHER' OR "note" IS NOT NULL);

-- Post actions target a post only, user actions a user only.
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_target" CHECK (
  CASE WHEN "action" IN ('SUSPEND_USER', 'UNSUSPEND_USER')
    THEN "target_user_id" IS NOT NULL AND "post_id" IS NULL
    ELSE "post_id" IS NOT NULL AND "target_user_id" IS NULL
  END
);
