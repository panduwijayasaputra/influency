-- US-046: individual unlocks are permanent and cost 5–1,000 Koin (LOCKED, Monetization Spec v1 §2). Hand-edited.
-- One-time in-place correction of out-of-range prices: allowed only because no purchase references an offer yet.
-- From here on post_offers stays append-only.
UPDATE "post_offers" SET "price_coins" = LEAST(GREATEST("price_coins", 5), 1000)
  WHERE "price_coins" < 5 OR "price_coins" > 1000;

-- AlterTable (also drops post_offers_duration_positive)
ALTER TABLE "post_offers" DROP COLUMN "duration_seconds";

ALTER TABLE "post_offers" DROP CONSTRAINT "post_offers_price_coins_positive";
ALTER TABLE "post_offers" ADD CONSTRAINT "post_offers_price_coins_range" CHECK ("price_coins" BETWEEN 5 AND 1000);
