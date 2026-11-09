# Technical Plan: US-018 — Set Premium Post Price & Duration

## Architecture Overview

Agreed with the user:

- **Append-only `post_offers` table.** Each change inserts a new row with `version = latest + 1`, and rows are never updated or deleted. The **current offer is the highest version**. There is no `active` flag, so nothing can drift out of sync. The future unlock story will reference a specific offer row and snapshot its `price_coins` / `duration_seconds` / `version` into `content_purchases`. That is how existing buyers keep their terms (AC 3–4).
- **One endpoint:** `PUT /api/v1/creators/me/posts/:id/offer` with `{ priceCoins, durationDays }`, owner-scoped like the rest of the studio posts module. Identical terms → returns the current version, no new row (idempotent re-submit).
- **Whole days in the UI and API body, seconds in the DB** (`duration_seconds = durationDays * 86_400`, handoff §10).
- **Limits are TBD placeholders** (shared constants, enforced by Zod on web and API): price 1–10,000 Koin, duration 1–365 days. The DB CHECKs enforce only the invariant floor (`> 0`), so changing a placeholder never needs a migration.
- **FREE posts are rejected** with 409 `OFFER_REQUIRES_PREMIUM`. Offers stay in place if a post later flips to FREE, and are ignored while it is FREE.
- **Any post status** may get a new offer. Changing the price of a published post is the reason versioning exists. US-019 adds publish rules ("premium needs an offer"), and the future unlock story reads the current offer under its own lock.
- `StudioPost` gains `offer: { version, priceCoins, durationSeconds, createdAt } | null` (the current version).

```
PUT /creators/me/posts/:id/offer {priceCoins, durationDays}
  BEGIN
    SELECT id, visibility FROM posts WHERE id=$1 AND creator_profile_id=$2 FOR UPDATE   → none: 404
    visibility FREE → 409 OFFER_REQUIRES_PREMIUM
    latest = SELECT … FROM post_offers WHERE post_id=$1 ORDER BY version DESC LIMIT 1
    same price + duration → no insert
    else INSERT post_offers (post_id, version = latest.version + 1 | 1, price_coins, duration_seconds)
  COMMIT → 200 StudioPost (offer = current version)
```

AC mapping:

| Acceptance criterion | How |
|---|---|
| Set whole-Koin price + access duration within configured limits | `setPostOfferSchema` (int, min/max from TBD constants) on web + API |
| Price > 0, duration positive | Zod mins + DB CHECKs `price_coins > 0`, `duration_seconds > 0` |
| Change creates a new version for future purchases only | Insert `version + 1` under the post-row lock; old rows untouched; UNIQUE `(post_id, version)` backstop |
| Existing buyers keep their terms | Offer rows are immutable (no update/delete path). Purchases (later story) FK to a row and snapshot its terms |

Out of scope: purchases/unlocks and the `OFFER_CHANGED` confirmation flow (koin-spend story), showing prices on the public page (US-014/US-019), offer history UI, removing an offer, DB triggers to block UPDATE/DELETE (same convention as `creator_application_reviews`: append-only by code path).

## Dependencies

- None new. Prisma, Zod, existing `ApprovedCreatorGuard`, `ZodValidationPipe`, `DomainError`, and the post-row `FOR UPDATE` pattern from `post-media.service.ts`.

## Risks

- **Concurrent edits** by the same creator (two tabs) → both read the same latest version. Mitigation: `SELECT … FOR UPDATE` on the post row serializes them (READ COMMITTED: the second sees the first's committed row after the lock). The UNIQUE `(post_id, version)` constraint makes a duplicate version impossible regardless.
- **BIGINT → JSON.** `price_coins` is `BigInt` in Prisma. Convert with `Number()` in `toStudioPost`. This is safe because the API caps price at 10,000 (far below 2^53). Add a one-line comment saying so.
- **StudioPost shape change** breaks web fixtures/tests that build `StudioPost` objects. Grep and add `offer: null`.

## Tasks

### TASK-052: Post offers — schema, shared contract and PUT offer endpoint

**Shared** (`packages/shared/src/posts.ts`):

```ts
/** Placeholder limits (TBD business decision) for per-post unlock offers. */
export const POST_OFFER_MIN_PRICE_COINS = 1;
export const POST_OFFER_MAX_PRICE_COINS = 10_000;
export const POST_OFFER_MIN_DURATION_DAYS = 1;
export const POST_OFFER_MAX_DURATION_DAYS = 365;
export const SECONDS_PER_DAY = 86_400;

/** Body of PUT /creators/me/posts/:id/offer. Whole Koin, whole days. */
export const setPostOfferSchema = z.object({
  priceCoins: z.int('Harga harus bilangan bulat Koin.')
    .min(POST_OFFER_MIN_PRICE_COINS, `Harga minimal ${POST_OFFER_MIN_PRICE_COINS} Koin.`)
    .max(POST_OFFER_MAX_PRICE_COINS, `Harga maksimal ${POST_OFFER_MAX_PRICE_COINS} Koin.`),
  durationDays: z.int('Durasi harus bilangan bulat hari.')
    .min(POST_OFFER_MIN_DURATION_DAYS, `Durasi minimal ${POST_OFFER_MIN_DURATION_DAYS} hari.`)
    .max(POST_OFFER_MAX_DURATION_DAYS, `Durasi maksimal ${POST_OFFER_MAX_DURATION_DAYS} hari.`),
});
export type SetPostOfferInput = z.infer<typeof setPostOfferSchema>;

/** Current offer version of a post (studio). */
export const postOfferSchema = z.object({
  version: z.int(),
  priceCoins: z.int(),
  durationSeconds: z.int(),
  createdAt: z.string(),
});
export type PostOffer = z.infer<typeof postOfferSchema>;
```

Add `offer: postOfferSchema.nullable()` to `studioPostSchema`. Export from the shared index as the other post exports are.

`packages/shared/src/errors.ts`: add `OFFER_REQUIRES_PREMIUM: { status: 409, message: 'Harga hanya bisa diatur untuk post Premium.' }` next to the media errors.

**Prisma** (`apps/api/prisma/schema.prisma`):

```prisma
/// US-018 per-post unlock pricing. Append-only: a change inserts version + 1; the current offer is the highest
/// version. Purchases reference a row and snapshot its terms, so existing buyers keep what they paid for.
model PostOffer {
  id              String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  postId          String   @map("post_id") @db.Uuid
  version         Int
  priceCoins      BigInt   @map("price_coins")
  durationSeconds Int      @map("duration_seconds")
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  post            Post     @relation(fields: [postId], references: [id], onDelete: Restrict)

  @@unique([postId, version])
  @@map("post_offers")
}
```

Add `offers PostOffer[]` to `Post`. Create the migration with `pnpm --filter @influency/api exec prisma migrate dev --create-only --name post_offers`. Hand-edit it to add the CHECKs, with a header comment like the `creator_application_reviews` migration:

```sql
ALTER TABLE "post_offers" ADD CONSTRAINT "post_offers_price_coins_positive" CHECK ("price_coins" > 0);
ALTER TABLE "post_offers" ADD CONSTRAINT "post_offers_duration_positive" CHECK ("duration_seconds" > 0);
ALTER TABLE "post_offers" ADD CONSTRAINT "post_offers_version_positive" CHECK ("version" >= 1);
```

Then apply it (`pnpm db:migrate`) and `pnpm --filter @influency/api generate`. No max CHECK: the max is a TBD placeholder.

**Service** (`apps/api/src/modules/posts/posts.service.ts`):

- `toStudioPost(row: Post & { offers: PostOffer[] })` → adds `offer: row.offers[0] ? { version, priceCoins: Number(priceCoins), durationSeconds, createdAt: iso } : null`. Comment: `Number()` is safe because the API caps price at POST_OFFER_MAX_PRICE_COINS.
- One `const currentOffer = { offers: { orderBy: { version: 'desc' }, take: 1 } } as const;` include, used by `create` (returns `offer: null` naturally), `list` and `get`. `update` already goes through `get`.
- New method:

```ts
/** Appends a new offer version under the post-row lock; identical terms keep the current version. */
async setOffer(creatorProfileId: string, id: string, input: SetPostOfferInput): Promise<StudioPost> {
  const durationSeconds = input.durationDays * SECONDS_PER_DAY;
  await this.prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ visibility: PostVisibility }[]>`
      SELECT visibility FROM posts
      WHERE id = ${id}::uuid AND creator_profile_id = ${creatorProfileId}::uuid
      FOR UPDATE`;
    if (locked.length === 0) throw new DomainError('NOT_FOUND');
    if (locked[0].visibility !== 'PREMIUM') throw new DomainError('OFFER_REQUIRES_PREMIUM');
    const latest = await tx.postOffer.findFirst({ where: { postId: id }, orderBy: { version: 'desc' } });
    if (latest && latest.priceCoins === BigInt(input.priceCoins) && latest.durationSeconds === durationSeconds) return;
    await tx.postOffer.create({
      data: { postId: id, version: (latest?.version ?? 0) + 1, priceCoins: BigInt(input.priceCoins), durationSeconds },
    });
  });
  return this.get(creatorProfileId, id);
}
```

(Match how `post-media.service.ts` reads the raw enum value. Cast or compare it as a string if `$queryRaw` returns plain text.)

**Controller** (`posts.controller.ts`): add

```ts
@Put(':id/offer')
setOffer(
  @Req() req: FastifyRequest,
  @Param('id', postIdPipe) id: string,
  @Body(new ZodValidationPipe(setPostOfferSchema)) body: SetPostOfferInput,
): Promise<StudioPost> {
  return this.posts.setOffer(req.creatorProfileId!, id, body);
}
```

Returns 200. CSRF is already global.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/posts.ts` | Offer constants, `setPostOfferSchema`, `postOfferSchema`, `offer` on `studioPostSchema` |
| MODIFY | `packages/shared/src/errors.ts` | `OFFER_REQUIRES_PREMIUM` |
| MODIFY | `packages/shared/src/posts.test.ts` (or create if absent) | Schema boundary tests |
| MODIFY | `apps/api/prisma/schema.prisma` | `PostOffer` model + `Post.offers` |
| CREATE | `apps/api/prisma/migrations/<ts>_post_offers/migration.sql` | Table, unique, FK RESTRICT, hand-added CHECKs |
| MODIFY | `apps/api/src/modules/posts/posts.service.ts` | `setOffer`, current-offer include, `toStudioPost.offer` |
| MODIFY | `apps/api/src/modules/posts/posts.controller.ts` | `PUT :id/offer` |
| CREATE | `apps/api/src/modules/posts/post-offers.integration.spec.ts` | Integration tests (fixed id range `0190a000-0000-7000-8000-0000001f…`) |
| MODIFY | `apps/api/src/modules/posts/posts.integration.spec.ts` | Expect `offer: null` on existing response assertions |

**Testing:**
- Shared unit: `setPostOfferSchema` accepts 1/1 and 10000/365; rejects 0, -1, 1.5, 10001, durationDays 0, 366, strings, missing fields (Indonesian messages).
- Integration (real Postgres, `app.inject`, approved demo-style creator + second creator + plain user, own fixed ids in the `1f` range):
  - Fresh PREMIUM post: GET → `offer: null`.
  - PUT `{priceCoins: 5, durationDays: 7}` → 200, `offer: { version: 1, priceCoins: 5, durationSeconds: 604800 }`; GET and list return the same offer.
  - PUT again with identical terms → still version 1; exactly one row in `post_offers`.
  - PUT `{priceCoins: 8, durationDays: 7}` → version 2. DB still holds v1 with `price_coins = 5` unchanged (existing terms preserved). GET returns v2.
  - Works on a post in any status (set `status = PUBLISHED` directly via Prisma, then PUT → new version).
  - Concurrency: `Promise.all` of two PUTs with different prices on a fresh post → both 200, rows have versions exactly `{1, 2}`.
  - FREE post → 409 `OFFER_REQUIRES_PREMIUM`, no row.
  - Validation → 400 `VALIDATION_FAILED` (0 price, 10001, 1.5, durationDays 0/366, missing body).
  - Another creator's post / unknown uuid → 404 `NOT_FOUND`; malformed id → 400; non-creator user → 403; no session → 401; cookie + wrong Origin → 403.
  - DB CHECK: raw `INSERT … price_coins = 0` and `duration_seconds = 0` rejected.
- `pnpm check` passes.

---

### TASK-053: Studio "Harga & Akses" section on the post edit page

**Component** `apps/web/src/app/studio/posts/[postId]/post-offer-form.tsx` (`'use client'`), props `{ postId: string; offer: PostOffer | null }`:

- Heading "Harga & Akses". If `offer` is set, show "Versi {offer.version}: {priceCoins} Koin · {durationSeconds / SECONDS_PER_DAY} hari". Otherwise show "Belum ada harga. Post Premium perlu harga sebelum dipublikasikan."
- Two `Input type="number" inputMode="numeric"` with `min`/`max` from the shared constants: "Harga (Koin)" (`priceCoins`) and "Durasi akses (hari)" (`durationDays`). Prefill from the current offer. Use `Label` + `htmlFor`, and render errors with `aria-describedby` / `role="alert"` the same way `post-form.tsx` does.
- Helper text: "Perubahan harga dan durasi hanya berlaku untuk pembelian berikutnya."
- Submit: `setPostOfferSchema.safeParse({ priceCoins: Number(price), durationDays: Number(days) })`. Show field errors on failure, with no fetch. On success, `PUT /api/v1/creators/me/posts/${postId}/offer` (`credentials: 'include'`, JSON). On 200, parse `studioPostSchema`, show "Tersimpan.", and call `router.refresh()`. On error, parse `errorResponseSchema` and map field issues / the message exactly like `PostForm` (reuse its `byField` approach; extract it to a small shared helper in `apps/web/src/app/studio/posts/` only if it would otherwise be copied verbatim). Disable the button while pending.

**Page** `apps/web/src/app/studio/posts/[postId]/page.tsx`: render `{post.visibility === 'PREMIUM' && <PostOfferForm postId={post.id} offer={post.offer} />}` between `PostForm` and `PostMedia`. Check that `PostForm` calls `router.refresh()` after a successful save, so the section appears or disappears when visibility changes. Add the refresh if it's missing.

**Fixtures:** `studioPostSchema` now requires `offer`. Grep `apps/web` for StudioPost fixtures (`studio-posts.test.ts`, `post-form` / `my-post-list` tests, etc.) and add `offer: null`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/app/studio/posts/[postId]/post-offer-form.tsx` | Offer form |
| CREATE | `apps/web/src/app/studio/posts/[postId]/post-offer-form.test.tsx` | Component tests |
| MODIFY | `apps/web/src/app/studio/posts/[postId]/page.tsx` | Render section for PREMIUM posts |
| MODIFY | `apps/web/src/app/studio/posts/post-form.tsx` | Only if `router.refresh()` is missing after save |
| MODIFY | `apps/web/src/lib/api/studio-posts.test.ts` + other StudioPost fixtures | `offer` field |

**Testing** (Testing Library + jsdom, `fetch` mocked like `post-media.test.tsx`):
- No offer → "Belum ada harga" text, empty inputs.
- With offer v2 (5 Koin, 604800 s) → shows "Versi 2", inputs prefilled 5 / 7.
- Price 0 or days 400 → field error shown, `fetch` not called.
- Valid submit → PUT to `/api/v1/creators/me/posts/<id>/offer` with body `{"priceCoins":5,"durationDays":7}`, then "Tersimpan." and `router.refresh` called.
- API 409 `OFFER_REQUIRES_PREMIUM` → its message shown.
- Page-level: section absent for FREE posts (if the page has a test harness; otherwise covered by manual UAT).
- `pnpm check` passes.
