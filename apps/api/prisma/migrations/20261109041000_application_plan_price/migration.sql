-- onboarding US-053: the subscription price chosen in the creator application (plan v1 is created on approval).
ALTER TABLE "creator_profiles" ADD COLUMN "requested_plan_price_coins" BIGINT;
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_requested_plan_price_range" CHECK ("requested_plan_price_coins" IS NULL OR "requested_plan_price_coins" BETWEEN 10 AND 5000);
