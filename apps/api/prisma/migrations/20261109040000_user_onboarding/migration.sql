-- onboarding US-051: when the user finished or skipped the welcome stepper. Existing users count as done.
ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" TIMESTAMPTZ(3);
UPDATE "users" SET "onboarding_completed_at" = now();
