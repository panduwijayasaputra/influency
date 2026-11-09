-- AlterEnum
ALTER TYPE "coin_entry_type" ADD VALUE 'SUBSCRIPTION_DEBIT';

-- AlterEnum
ALTER TYPE "coin_source_type" ADD VALUE 'SUBSCRIPTION_PERIOD';

-- AlterEnum
ALTER TYPE "revenue_source_type" ADD VALUE 'SUBSCRIPTION_PERIOD';

-- CreateTable
CREATE TABLE "subscription_periods" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "creator_profile_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "price_coins" BIGINT NOT NULL,
    "fee_bps" INTEGER NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "canceled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_periods_user_id_creator_profile_id_ends_at_idx" ON "subscription_periods"("user_id", "creator_profile_id", "ends_at");

-- CreateIndex
CREATE INDEX "subscription_periods_creator_profile_id_starts_at_idx" ON "subscription_periods"("creator_profile_id", "starts_at");

-- AddForeignKey
ALTER TABLE "subscription_periods" ADD CONSTRAINT "subscription_periods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_periods" ADD CONSTRAINT "subscription_periods_creator_profile_id_fkey" FOREIGN KEY ("creator_profile_id") REFERENCES "creator_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_periods" ADD CONSTRAINT "subscription_periods_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "creator_subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- LOCKED (Monetization Spec v1 §2): price 10–5,000 Koin, fee 15% (1,500 bps), exactly 30 days (not calendar months).
ALTER TABLE "subscription_periods" ADD CONSTRAINT "subscription_periods_price_range" CHECK ("price_coins" BETWEEN 10 AND 5000);
ALTER TABLE "subscription_periods" ADD CONSTRAINT "subscription_periods_fee_bps" CHECK ("fee_bps" = 1500);
ALTER TABLE "subscription_periods" ADD CONSTRAINT "subscription_periods_duration_30" CHECK ("duration_days" = 30);
ALTER TABLE "subscription_periods" ADD CONSTRAINT "subscription_periods_30_days" CHECK ("ends_at" = "starts_at" + interval '720 hours');

-- A second renewal for the same start can never exist next to a live one, even without the wallet lock.
CREATE UNIQUE INDEX "subscription_periods_one_live_per_start"
  ON "subscription_periods" ("user_id", "creator_profile_id", "starts_at") WHERE "canceled_at" IS NULL;

-- Periods are never deleted, and the only allowed edit is cancelling a live one (canceled_at NULL → a time).
CREATE FUNCTION subscription_periods_guard() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'subscription_periods rows are never deleted';
  END IF;
  IF OLD."canceled_at" IS NOT NULL
     OR NEW."canceled_at" IS NULL
     OR (to_jsonb(NEW) - 'canceled_at') IS DISTINCT FROM (to_jsonb(OLD) - 'canceled_at') THEN
    RAISE EXCEPTION 'subscription_periods allows only cancelling a live period';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER subscription_periods_guard_trigger BEFORE UPDATE OR DELETE ON "subscription_periods"
  FOR EACH ROW EXECUTE FUNCTION subscription_periods_guard();
