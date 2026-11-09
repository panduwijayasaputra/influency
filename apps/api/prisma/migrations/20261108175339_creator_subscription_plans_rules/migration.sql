-- LOCKED (Monetization Spec v1 §2): plan price 10–5,000 Koin, duration exactly 30 days.
ALTER TABLE "creator_subscription_plans" ADD CONSTRAINT "creator_subscription_plans_price_range" CHECK ("price_coins" BETWEEN 10 AND 5000);
ALTER TABLE "creator_subscription_plans" ADD CONSTRAINT "creator_subscription_plans_duration_30" CHECK ("duration_days" = 30);
ALTER TABLE "creator_subscription_plans" ADD CONSTRAINT "creator_subscription_plans_version_positive" CHECK ("version" >= 1);

-- Append-only: a change is a new version, never an edit, so periods keep the plan they bought.
CREATE FUNCTION creator_subscription_plans_append_only() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN RAISE EXCEPTION 'creator_subscription_plans is append-only'; END $$;
CREATE TRIGGER creator_subscription_plans_no_update_delete BEFORE UPDATE OR DELETE ON "creator_subscription_plans"
  FOR EACH ROW EXECUTE FUNCTION creator_subscription_plans_append_only();
