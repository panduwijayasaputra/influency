-- AlterTable
ALTER TABLE "users" ADD COLUMN "bio" TEXT;

-- Same cap as the creator bio.
ALTER TABLE "users" ADD CONSTRAINT "users_bio_length" CHECK ("bio" IS NULL OR char_length("bio") <= 500);
