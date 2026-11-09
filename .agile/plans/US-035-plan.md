# Technical Plan: US-035 — Creator Subscription Plan API

## Architecture Overview

New `subscriptions` module (`apps/api/src/modules/subscriptions/`). A creator's plan is an **append-only versioned** table, like `post_offers`: every change (price or active flag) inserts `version + 1`, and the current plan is the highest version. Periods (US-037) reference the exact version row and snapshot its price, so existing subscribers keep what they paid for.

Endpoints:
- `GET /creators/me/subscription-plan` and `PUT /creators/me/subscription-plan` (`ApprovedCreatorGuard`; the owner comes from `req.creatorProfileId`, never from the body).
- `GET /creators/:slug/subscription` (`OptionalSessionGuard`, `no-store`) → `CreatorSubscriptionState` (TASK-158). It stays out of the cached public profile, the same split as `/follow`.

## Dependencies

- TASK-158 (contract). One Prisma migration.

## Risks

- **Concurrent PUTs** racing on `version`: `UNIQUE (creator_profile_id, version)` makes one fail. Lock the creator profile row (`SELECT … FROM creator_profiles WHERE id = $1 FOR UPDATE`) before reading the max version, so both succeed in order.
- `viewer` in this story has no periods yet (US-037) and no tip rule (US-039). It returns `current: null, scheduled: null, canTip: false` with shortcut comments naming those stories.

## Tasks

### TASK-162: Subscription plan schema, migration and seed

`apps/api/prisma/schema.prisma`:
```prisma
/// purchases US-035: one plan per creator, append-only versions; current = highest version. price 10–5,000 (LOCKED), 30 days fixed.
model CreatorSubscriptionPlan {
  id               String         @id @default(dbgenerated("uuidv7()")) @db.Uuid
  creatorProfileId String         @map("creator_profile_id") @db.Uuid
  version          Int
  priceCoins       BigInt         @map("price_coins")
  durationDays     Int            @default(30) @map("duration_days")
  active           Boolean
  createdAt        DateTime       @default(now()) @map("created_at") @db.Timestamptz(3)
  creatorProfile   CreatorProfile @relation(fields: [creatorProfileId], references: [id], onDelete: Restrict)
  @@unique([creatorProfileId, version])
  @@map("creator_subscription_plans")
}
```
Add the back-relation `subscriptionPlans CreatorSubscriptionPlan[]` on `CreatorProfile`.

Migration `pnpm db:migrate --name creator_subscription_plans`, then append SQL:
- `CHECK (price_coins BETWEEN 10 AND 5000)` named `creator_subscription_plans_price_range`
- `CHECK (duration_days = 30)` named `creator_subscription_plans_duration_30`
- `CHECK (version >= 1)`
- a trigger rejecting UPDATE/DELETE (reuse the pattern and function style of the `coin_ledger_entries` append-only trigger)

Seed: add `DEMO_SUBSCRIPTION_PLAN_IDS = { claudia: '…0201', creatorB: '…0202' }` to `src/common/demo-ids.ts`. Create `prisma/seed/subscription-plans.ts` `seedSubscriptionPlans` that upserts version 1 by fixed id (claudia 150 Koin, creatorB 75 Koin, both active, values labelled `EXAMPLE` in a comment). Register it in `seedSteps` after `roles and creator profiles`.

**Files:**
| Action | File Path | Purpose |
|---|---|---|
| MODIFY | `apps/api/prisma/schema.prisma` (+ migration) | Model, CHECKs, trigger |
| MODIFY | `apps/api/src/common/demo-ids.ts` | Fixed ids |
| CREATE | `apps/api/prisma/seed/subscription-plans.ts` | Seed step |
| MODIFY | `apps/api/prisma/seed/seed.ts` | Register step |
| CREATE | `apps/api/src/modules/subscriptions/plan-schema.integration.spec.ts` | DB rules |

**Testing (real Postgres):** price 9 and 5,001 rejected, 10 and 5,000 accepted; duplicate version rejected; UPDATE/DELETE rejected by the trigger; running the seed twice is a no-op; the schema-conventions spec still passes.

---

### TASK-163: Owner plan API, public subscription state and profile wiring

`packages/shared/src/purchases.ts` adds:
```ts
export const putSubscriptionPlanRequestSchema = z.strictObject({ priceCoins: z.int().min(10).max(5000), active: z.boolean() });
export const ownSubscriptionPlanSchema = z.object({ priceCoins: z.int(), durationDays: z.literal(30), active: z.boolean(), version: z.int(), updatedAt: z.iso.datetime() }).nullable();
```

`apps/api/src/modules/subscriptions/`:
- `subscription-plans.service.ts` `SubscriptionPlansService`:
  - `getOwn(creatorProfileId)`
  - `putOwn(creatorProfileId, input)`: in a `$transaction`, lock the creator row `FOR UPDATE`, read the current version, return it unchanged when price and active are equal, otherwise insert `version + 1`
  - `currentActivePlanInTx(tx, creatorProfileId)` → `{ id, priceCoins, version } | null` (highest version, `null` when not active), exported for US-037
  - `stateFor(slug, userId | null)`: the creator must match `PUBLIC_CREATOR` (else `NOT_FOUND`). Plan = the current active version. `viewer` is null for guests; otherwise `{ current: null, scheduled: null, canTip: false }` with `// shortcut: periods in US-037, tips in US-039`.
- `subscription-plans.controller.ts`: `@Controller('creators')` with `GET me/subscription-plan` and `PUT me/subscription-plan` (`ApprovedCreatorGuard`, body `ZodValidationPipe(putSubscriptionPlanRequestSchema)`, `no-store`), and `GET :slug/subscription` (`OptionalSessionGuard`, `no-store`). Route order: declare the `me/…` routes before `:slug/…`, or check that `me` is a reserved slug (it is).
- `subscriptions.module.ts`: exports `SubscriptionPlansService`; registered in `AppModule`.

Web: `lib/api/creator-subscription.server.ts` and `fetchCreatorSubscription` in `lib/api/purchases.ts` become real fetches. Remove the dummy plan/subscription from `lib/demo.ts` (keep only what US-036 to US-039 still need).

Update `.agile/guidelines/codebase-map.md` (module, model, endpoints).

**Files:**
| Action | File Path | Purpose |
|---|---|---|
| MODIFY | `packages/shared/src/purchases.ts` | Plan DTOs |
| CREATE | `apps/api/src/modules/subscriptions/subscriptions.module.ts`, `subscription-plans.service.ts`, `subscription-plans.controller.ts` | Module |
| CREATE | `apps/api/src/modules/subscriptions/subscription-plans.integration.spec.ts` | Tests |
| MODIFY | `apps/api/src/app.module.ts` | Register |
| MODIFY | `apps/web/src/lib/api/creator-subscription.server.ts`, `lib/api/purchases.ts`, `lib/demo.ts` | Real data |

**Testing (Supertest, real Postgres):**
- the owner sets 75 → version 1, changes it to 100 → version 2, and repeating 100 does not add a version
- 9, 5,001 and 12.5 → 400 `VALIDATION_FAILED`; an unknown key such as `durationDays` → 400
- a non-creator → 403 `CREATOR_NOT_APPROVED`; a guest → 401
- two concurrent PUTs both succeed, as versions n+1 and n+2
- `GET /creators/:slug/subscription` for a guest → `viewer: null`; signed in → viewer object; a deactivated plan → `plan: null`; a suspended or unknown creator → 404
- CSRF: a PUT without Origin → 403
