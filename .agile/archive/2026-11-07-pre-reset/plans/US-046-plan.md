# Technical Plan: US-046 — Permanent Unlock Offer (5–1,000 Koin)

## Architecture Overview

US-046 changes US-018 offers to match Monetization Spec v1 §2, which is **LOCKED**: a per-post unlock costs 5–1,000 whole Koin and never expires. The work is mostly deletion.

- **Price limits become LOCKED constants.** `POST_OFFER_MIN_PRICE_COINS = 5` and `POST_OFFER_MAX_PRICE_COINS = 1_000` in shared. Because the values are LOCKED and not TBD, the DB enforces them too: CHECK `price_coins BETWEEN 5 AND 1000` replaces `price_coins > 0`.
- **Duration is removed everywhere.** That means the `post_offers.duration_seconds` column, `durationDays` in the PUT body, `durationSeconds` in `StudioPost.offer` and `PublicPost.offer`, the duration constants and `SECONDS_PER_DAY` (its only users are offers). The UI says "akses permanen" instead.
- **Stale clients get a 400.** `setPostOfferSchema` becomes `z.strictObject({ priceCoins })`. An old client that sends `durationDays` gets 400 `VALIDATION_FAILED`, so the field is never silently ignored. (User decision.)
- **The migration clamps bad stored prices in place** (below 5 → 5, above 1,000 → 1,000) before it adds the CHECK. This is a one-time, documented exception to append-only. It is safe because no purchases reference offers yet (there is no `content_purchases` table). (User decision.)
- **Versioning stays as it is.** A new price appends `version + 1` under the post-row lock. The same price keeps the current version.
- **AC 5 ("an invalid current offer can't be published") holds by construction.** The DB CHECK makes an out-of-range offer impossible to store, and duration no longer exists. `publish` keeps its `OFFER_REQUIRED` check unchanged. We don't add a range re-check in `publish` because it would be dead code. A test proves the CHECK rejects 4 and 1,001.

| AC | Covered by |
|----|------------|
| 4 rejected, 5 and 1,000 accepted, 1,001 rejected, server + studio | Shared `setPostOfferSchema` used by the API pipe and the web form, plus the DB CHECK |
| No duration input anywhere; "akses permanen" | Column + schema fields removed, strict body, studio and public copy |
| New price → new version for future purchases | Unchanged `setOffer` append logic (existing tests kept) |
| Existing offers migrated | Migration: clamp UPDATE, DROP COLUMN, range CHECK |
| Invalid offer can't be published | The DB CHECK makes it unstorable; `OFFER_REQUIRED` stays |

## Dependencies

- None. No new packages.

## Risks

- **In-place UPDATE breaks the append-only rule.** This is acceptable only because there are no purchases yet. Say so in the migration header. Later offer fixes must append new versions.
- **The migration fails if a later migration already references `duration_seconds`.** None does (grep confirmed). Run `pnpm db:migrate` against a dev DB that has seeded/demo offers to confirm the clamp runs before the CHECK.
- **The shape change breaks fixtures.** `durationSeconds` disappears from both offer shapes. Grep `durationSeconds` together with `offer` in `apps/` and `packages/` and fix every fixture (the list is in the tasks). Leave media `durationSeconds` alone, because video length is a different field.
- **Seed:** no offer seed exists today (`apps/api/prisma/seed/` has none), so the seed needs no change. If a dev adds one, its prices must be within 5–1,000.

## Tasks

### TASK-058: Permanent offers — shared contract, migration and API

**Shared** (`packages/shared/src/posts.ts`):

```ts
/** LOCKED (Monetization Spec v1 §2): one per-post unlock price, whole Koin, permanent access. */
export const POST_OFFER_MIN_PRICE_COINS = 5;
export const POST_OFFER_MAX_PRICE_COINS = 1_000;

/** Body of PUT /creators/me/posts/:id/offer. Strict: unknown keys such as the old durationDays are rejected. */
export const setPostOfferSchema = z.strictObject({
  priceCoins: z
    .int('Harga harus bilangan bulat Koin.')
    .min(POST_OFFER_MIN_PRICE_COINS, `Harga minimal ${POST_OFFER_MIN_PRICE_COINS} Koin.`)
    .max(POST_OFFER_MAX_PRICE_COINS, `Harga maksimal ${POST_OFFER_MAX_PRICE_COINS} Koin.`),
});
```

- Delete `POST_OFFER_MIN_DURATION_DAYS`, `POST_OFFER_MAX_DURATION_DAYS` and `SECONDS_PER_DAY`. Remove `durationSeconds` from `postOfferSchema` and from the `publicPostSchema.offer` object, which becomes `z.object({ priceCoins: z.int() }).nullable()`. Update the "Current offer terms" comment so it says access is permanent.
- Remove the deleted names from the shared index exports, if they are listed explicitly there.
- Check the Indonesian message on unknown keys. Zod's default `unrecognized_keys` message is English. If the codebase maps Zod issues to Indonesian elsewhere, follow that. If it doesn't, keep the default, because the web form never sends extra keys.

**Prisma** (`apps/api/prisma/schema.prisma`): remove `durationSeconds` from `PostOffer`. Update the model doc comment to mention US-046: permanent access, price 5–1,000 enforced by a DB CHECK.

**Migration:** run `pnpm --filter @influency/api exec prisma migrate dev --create-only --name permanent_post_offers`, then hand-edit the file so it reads:

```sql
-- US-046: individual unlocks are permanent and cost 5–1,000 Koin (LOCKED, Monetization Spec v1 §2).
-- One-time in-place correction of out-of-range prices: allowed only because no purchase references an offer yet.
-- From here on post_offers stays append-only.
UPDATE "post_offers" SET "price_coins" = LEAST(GREATEST("price_coins", 5), 1000)
  WHERE "price_coins" < 5 OR "price_coins" > 1000;

ALTER TABLE "post_offers" DROP COLUMN "duration_seconds"; -- also drops post_offers_duration_positive

ALTER TABLE "post_offers" DROP CONSTRAINT "post_offers_price_coins_positive";
ALTER TABLE "post_offers" ADD CONSTRAINT "post_offers_price_coins_range" CHECK ("price_coins" BETWEEN 5 AND 1000);
```

Then run `pnpm --filter @influency/api generate`.

**API:**
- `apps/api/src/modules/posts/posts.service.ts`
  - Remove `SECONDS_PER_DAY` and `durationSeconds` from `toStudioPost`. Update the `Number()` comment: it is exact because the DB caps prices at 1,000.
  - In `setOffer`, drop the duration math. The early return becomes `if (latest?.priceCoins === priceCoins) return;` and `create` no longer gets `durationSeconds`. Keep the lock, the PREMIUM check and the version logic exactly as they are.
- `apps/api/src/modules/posts/public-posts.service.ts`: the offer is `{ priceCoins: Number(offer.priceCoins) }`. Update the comment the same way.
- `publish` needs no change.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/posts.ts` | LOCKED 5–1,000 constants, strict `{ priceCoins }` body, no duration in either offer shape |
| MODIFY | `packages/shared/src/index.ts` | Drop removed exports (if listed) |
| MODIFY | `packages/shared/src/posts.test.ts` | New boundary + strict cases |
| MODIFY | `apps/api/prisma/schema.prisma` | Drop `PostOffer.durationSeconds` |
| CREATE | `apps/api/prisma/migrations/<ts>_permanent_post_offers/migration.sql` | Clamp, drop column, range CHECK |
| MODIFY | `apps/api/src/modules/posts/posts.service.ts` | `toStudioPost`, `setOffer` |
| MODIFY | `apps/api/src/modules/posts/public-posts.service.ts` | Public offer shape |
| MODIFY | `apps/api/src/modules/posts/post-offers.integration.spec.ts` | Update to the new contract |
| MODIFY | `apps/api/src/modules/posts/post-publish.integration.spec.ts` | Offer fixture without `durationSeconds` |
| MODIFY | `apps/api/src/modules/posts/public-posts.integration.spec.ts` | Fixtures + expected `offer: { priceCoins: 8 }` |

**Testing:**
- Shared unit (`posts.test.ts`):
  - accepts `{priceCoins: 5}` and `{priceCoins: 1000}`;
  - rejects 4 ("Harga minimal 5 Koin."), 1001 ("Harga maksimal 1000 Koin."), 0, 1.5, `'5'` and a missing field;
  - rejects `{priceCoins: 5, durationDays: 7}` (strict).
  - Delete the old duration cases.
- Integration (`post-offers.integration.spec.ts`, keep the fixed id range `…1f`):
  - PUT `{priceCoins: 5}` → 200, `offer` equals `{version: 1, priceCoins: 5, createdAt}` exactly, with no `durationSeconds` key. The same holds for GET and list.
  - PUT 1000 → 200, new version.
  - The same price again → no new row.
  - Price 5 → 8 → version 2. v1 is unchanged in the DB.
  - Any status, the concurrency test and FREE → `OFFER_REQUIRES_PREMIUM` stay as they are. Change the concurrency prices from `[3, 4, 6]` to in-range values such as `[5, 6, 7]`.
  - 400 `VALIDATION_FAILED` for 4, 1001, 1.5, a missing body and `{priceCoins: 5, durationDays: 7}`.
  - Raw SQL `INSERT` with `price_coins` 4 or 1001 → rejected with `/post_offers_price_coins_range/`. 5 and 1000 succeed. Replace the old `> 0` / duration CHECK tests.
- `public-posts.integration.spec.ts`: the PREMIUM feed item's offer is exactly `{ priceCoins: 8 }`.
- `post-publish.integration.spec.ts`: still green with the duration-free fixture (PREMIUM with an offer publishes, without one → `OFFER_REQUIRED`).
- Manually run `pnpm db:migrate` on the dev DB that holds an existing offer and confirm it applies cleanly.

---

### TASK-059: Studio offer form and public cards — permanent access copy

**`apps/web/src/app/studio/posts/[postId]/post-offer-form.tsx`:**
- Remove the `days` state, the "Durasi akses (hari)" field, the duration imports and `'durationDays'` from the `Field` union.
- Submit `setPostOfferSchema.safeParse({ priceCoins: Number(price) })`. The PUT body is then `{"priceCoins":5}`.
- The status line becomes `Versi ${offer.version}: ${offer.priceCoins} Koin · akses permanen`.
- Add one hint under the price field: `Pembeli mendapat akses permanen. Harga ${POST_OFFER_MIN_PRICE_COINS}–${POST_OFFER_MAX_PRICE_COINS} Koin.`
- The footnote becomes "Perubahan harga hanya berlaku untuk pembelian berikutnya."
- Keep the price input's `min`/`max` from the shared constants.

**`apps/web/src/app/(public)/[creatorSlug]/creator-posts.tsx`:** render the lock line as `{post.offer.priceCoins} Koin · akses permanen` and drop the `SECONDS_PER_DAY` import.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/app/studio/posts/[postId]/post-offer-form.tsx` | Price-only form, permanent copy |
| MODIFY | `apps/web/src/app/studio/posts/[postId]/post-offer-form.test.tsx` | Update to the new contract |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/creator-posts.tsx` | "akses permanen" |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/creator-posts.test.tsx` | Fixture `offer: { priceCoins: 8 }`, expected text |
| MODIFY | any other `StudioPost`/`PublicPost` fixtures with an offer `durationSeconds` (grep) | Shape |

**Testing (component, Vitest + Testing Library):**
- Offer form:
  - With offer v2 (5 Koin) → shows "Versi 2: 5 Koin · akses permanen", price prefilled with 5.
  - There is no "Durasi" label or input (`queryByLabelText(/durasi/i)` is null).
  - Price 4 → "Harga minimal 5 Koin." and 1001 → "Harga maksimal 1000 Koin.", and `fetch` is not called.
  - Price 1000 → PUT body `{"priceCoins":1000}`, then "Tersimpan." and `router.refresh`.
  - The API 409 message is still shown.
- Creator posts: the premium card shows "8 Koin · akses permanen" and no "hari".

## Out of scope

- Purchases, entitlements and the "already subscribed" disclosure (US-050 / koin-spend stories).
- Offer history UI.
- Changing `publish` beyond what the DB CHECK already guarantees.
- Updating `codebase-map.md` (`/dev-team` does it on completion).
