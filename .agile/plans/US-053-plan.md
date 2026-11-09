# Technical Plan: US-053 — Subscription Price in the Creator Application

## Architecture Overview

- **Data:** a new nullable column `creator_profiles.requested_plan_price_coins BIGINT`, with CHECK `requested_plan_price_coins IS NULL OR requested_plan_price_coins BETWEEN 10 AND 5000`.
- **Apply:** `creatorApplicationSchema` gains an optional `subscriptionPriceCoins: z.int().min(PLAN_PRICE_MIN).max(PLAN_PRICE_MAX)`.
  - `apply` stores it (`BigInt`), or null when absent; a resubmit overwrites it.
  - The response gains `subscriptionPriceCoins: number | null`, read with `toSafeInt`.
- **Approval:** `AdminCreatorsService.decide` adds a step inside its existing transaction, right after the conditional `updateMany` (which row-locks the profile and lets only one concurrent decision pass).
  - Only when `decision === 'APPROVED'`: read the profile's `requested_plan_price_coins`.
  - If it is set and no `creator_subscription_plans` row exists for the profile, create `{ version: 1, priceCoins, active: true }`.
  - The existing unique `(creator_profile_id, version)` makes a duplicate impossible even if the check races.
- **No money moves here:** no ledger, no idempotency key. The plan stays append-only, and later changes go through `PUT /creators/me/subscription-plan` (unchanged).
- **Visibility:** the price is only in the applicant's own `GET /creators/me/application` and the admin's application list (if that list maps fields explicitly, leave it as is). Public routes read plans, not this column.

## Dependencies

- TASK-192 (the UI already sends `subscriptionPriceCoins`).

## Risks

- **Concurrent approvals:** both would try to create plan v1. Only one passes the `PENDING_REVIEW` conditional update; the other throws `CREATOR_APPLICATION_NOT_PENDING` before the plan step. The unique index is the backstop.
- **Approval of an applicant without a price** (an old application or a direct API call) creates no plan. That is today's behaviour, and the creator sets one in Studio.
- **Seeded plans:** `prisma/seed/subscription-plans.ts` seeds plans for demo creators directly; it is unaffected.

## Tasks

### TASK-197: Store the price with the application and create the plan on approval

- `prisma/schema.prisma` `CreatorProfile`: `requestedPlanPriceCoins BigInt? @map("requested_plan_price_coins")`.
  - Migration `20261109041000_application_plan_price`: add the column plus the CHECK `creator_profiles_requested_plan_price_range`.
  - Run `generate`.
- Shared `creators.ts`:
  - `creatorApplicationSchema` gains `subscriptionPriceCoins: z.int('Masukkan angka 10–5.000 Koin.').min(PLAN_PRICE_MIN, 'Masukkan angka 10–5.000 Koin.').max(PLAN_PRICE_MAX, 'Masukkan angka 10–5.000 Koin.').optional()`. Import from `./purchases.js` and watch for circular imports; `purchases.ts` imports `posts.ts` only.
  - `creatorApplicationResponseSchema` gains `subscriptionPriceCoins: z.int().nullable()`.
  - Update `creators.test.ts` and the web fixtures of `CreatorApplicationResponse`.
- `creators.service.ts`: `data.requestedPlanPriceCoins = input.subscriptionPriceCoins === undefined ? null : BigInt(input.subscriptionPriceCoins)`. `toResponse` maps it with `toSafeInt` (or null).
- `admin-creators.service.ts` `decide`: inside the tx, after the review row, when `decision === 'APPROVED'`:
  ```ts
  const { requestedPlanPriceCoins } = await tx.creatorProfile.findUniqueOrThrow({ where: { id: profileId }, select: { requestedPlanPriceCoins: true } });
  if (requestedPlanPriceCoins !== null && !(await tx.creatorSubscriptionPlan.findFirst({ where: { creatorProfileId: profileId }, select: { id: true } }))) {
    await tx.creatorSubscriptionPlan.create({ data: { creatorProfileId: profileId, version: 1, priceCoins: requestedPlanPriceCoins, active: true } });
  }
  ```
  Comment: one transaction with the approval; the profile row is already locked by the conditional update.
- Web:
  - `creator-path.tsx` prefill uses `initial?.subscriptionPriceCoins ?? 50`; remove the "until US-053" fallback note.
  - `submitCreatorApplication` already sends the field.
  - Map a `VALIDATION_FAILED` issue on `subscriptionPriceCoins` to the Langganan step (step 1).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/prisma/schema.prisma` | column |
| CREATE | `apps/api/prisma/migrations/20261109041000_application_plan_price/migration.sql` | column + CHECK |
| MODIFY | `packages/shared/src/creators.ts` (+ test) | request/response field |
| MODIFY | `apps/api/src/modules/creators/creators.service.ts` | store + return |
| MODIFY | `apps/api/src/modules/admin/admin-creators.service.ts` | plan on approval |
| MODIFY | `apps/web/src/components/onboarding/creator-path.tsx`, `lib/api/creator-application.ts` (+ tests, fixtures) | prefill + error step |

**Testing (integration, fresh rows per test):**
- Apply with 9 or 5001 → 400 on `subscriptionPriceCoins`; with 10 and 5000 → 201, stored and returned.
- Omitted → null.
- A CHECK constraint test: a raw insert of 9 fails.
- Resubmit after a rejection with a new price → the new price is stored.
- Approve → exactly one plan, `version 1`, `active`, at that price, and `GET /creators/:slug/subscription` shows it.
- Approve without a price → no plan.
- While pending or rejected, `GET /creators/:slug/subscription` → 404 (the creator is not public) and there are no plan rows.
- A second approve → `CREATOR_APPLICATION_NOT_PENDING` and still one plan.
- Concurrent approves (`Promise.all` of two) → one success, one `CREATOR_APPLICATION_NOT_PENDING`, one plan.
- After approval, `PUT /creators/me/subscription-plan` with a new price → version 2. The earlier period snapshots are unaffected (existing tests cover this).
- Web: the prefill from `initial.subscriptionPriceCoins`, and a server price error lands on Langganan.
