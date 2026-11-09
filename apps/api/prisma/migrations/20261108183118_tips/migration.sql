-- AlterEnum
ALTER TYPE "coin_entry_type" ADD VALUE 'TIP_DEBIT';

-- AlterEnum
ALTER TYPE "coin_source_type" ADD VALUE 'TIP';

-- AlterEnum
ALTER TYPE "revenue_source_type" ADD VALUE 'TIP';

-- CreateTable
CREATE TABLE "tips" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "creator_profile_id" UUID NOT NULL,
    "post_id" UUID,
    "amount_coins" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tips_creator_profile_id_created_at_idx" ON "tips"("creator_profile_id", "created_at");

-- CreateIndex
CREATE INDEX "tips_user_id_created_at_idx" ON "tips"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "tips" ADD CONSTRAINT "tips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tips" ADD CONSTRAINT "tips_creator_profile_id_fkey" FOREIGN KEY ("creator_profile_id") REFERENCES "creator_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tips" ADD CONSTRAINT "tips_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- LOCKED (Monetization Spec v1 §2): a tip is 1–1,000 Koin per transaction.
ALTER TABLE "tips" ADD CONSTRAINT "tips_amount_range" CHECK ("amount_coins" BETWEEN 1 AND 1000);

-- A tip is a record of money moved: corrections are compensating entries, never edits.
CREATE FUNCTION tips_append_only() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN RAISE EXCEPTION 'tips is append-only'; END $$;
CREATE TRIGGER tips_no_update_delete BEFORE UPDATE OR DELETE ON "tips"
  FOR EACH ROW EXECUTE FUNCTION tips_append_only();
