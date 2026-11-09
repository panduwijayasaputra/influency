-- Creator applications (US-010). Hand-edited: backfill existing rows before NOT NULL.

-- AlterTable
ALTER TABLE "creator_profiles" ADD COLUMN     "agreement_accepted_at" TIMESTAMPTZ(3),
ADD COLUMN     "agreement_version" TEXT,
ADD COLUMN     "bio" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "display_name" TEXT;

UPDATE "creator_profiles" cp
SET "display_name" = u."display_name",
    "agreement_version" = 'placeholder-2026-11',
    "agreement_accepted_at" = cp."created_at"
FROM "users" u
WHERE u."id" = cp."user_id";

ALTER TABLE "creator_profiles" ALTER COLUMN "agreement_accepted_at" SET NOT NULL,
ALTER COLUMN "agreement_version" SET NOT NULL,
ALTER COLUMN "display_name" SET NOT NULL;

-- Slugs are stored normalized, so UNIQUE(slug) is case-insensitive uniqueness.
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_slug_lowercase" CHECK ("slug" = lower("slug"));
-- Mirrors SLUG_PATTERN in packages/shared/src/creators.ts.
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_slug_format" CHECK ("slug" ~ '^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$');
