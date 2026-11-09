# QA Report: TASK-162 — Subscription plan schema, migration and seed

**Result:** PASS

## Checked

- `CreatorSubscriptionPlan` (`creator_subscription_plans`) follows the conventions (uuidv7 id, snake_case, `Timestamptz(3)`, BIGINT Koin, FK RESTRICT) and the append-only version pattern of `post_offers`: `UNIQUE (creator_profile_id, version)`.
- DB rules are in the migration, not only in code: `price_coins BETWEEN 10 AND 5000`, `duration_days = 30`, `version >= 1`, and a trigger that rejects UPDATE and DELETE. No float or numeric columns.
- Migrations: `20261108175331_creator_subscription_plans` (table) and `20261108175339_creator_subscription_plans_rules` (CHECKs and trigger). The generator was run twice by mistake; the table migration had already been applied to the dev DB, so the CHECKs went into the second, otherwise-empty migration instead of editing an applied one. No applied migration was changed.
- Seed: `seedSubscriptionPlans` creates version 1 for the two demo creators (EXAMPLE prices 150 and 75 Koin) by fixed id, and never rewrites an existing plan.

## Tests

`plan-schema.integration.spec.ts` (real Postgres): 9 and 5,001 rejected, 10 and 5,000 accepted; duration 31 rejected; duplicate version and version 0 rejected; UPDATE and DELETE rejected; seed twice leaves one version per creator. The existing schema-conventions spec also passes on the new migrations (`pnpm check` green).
