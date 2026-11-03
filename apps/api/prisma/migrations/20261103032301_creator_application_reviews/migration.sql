-- Creator application review history (US-011). Append-only; hand-edited to add the reason CHECK.

-- CreateEnum
CREATE TYPE "creator_review_decision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "creator_application_reviews" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "creator_profile_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "decision" "creator_review_decision" NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creator_application_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "creator_application_reviews_creator_profile_id_created_at_idx" ON "creator_application_reviews"("creator_profile_id", "created_at");

-- AddForeignKey
ALTER TABLE "creator_application_reviews" ADD CONSTRAINT "creator_application_reviews_creator_profile_id_fkey" FOREIGN KEY ("creator_profile_id") REFERENCES "creator_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_application_reviews" ADD CONSTRAINT "creator_application_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A rejection always carries a reason; an approval never does.
ALTER TABLE "creator_application_reviews" ADD CONSTRAINT "creator_application_reviews_reason" CHECK (("decision" = 'REJECTED') = ("reason" IS NOT NULL));
