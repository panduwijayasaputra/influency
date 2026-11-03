# QA Report: TASK-052 — Post offers — schema, shared contract and PUT offer endpoint

**Story:** US-018
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Endpoint lives in the existing `posts` module (`PUT /creators/me/posts/:id/offer`) behind the controller-level `ApprovedCreatorGuard`; body validated by shared `setPostOfferSchema` via `ZodValidationPipe`; id via the existing `postIdPipe`
- [x] Prisma model `PostOffer` + migration `20261103105446_post_offers` (hand-edited CHECKs, header comment like `creator_application_reviews`)
- [x] Shared contract: TBD placeholder constants, `setPostOfferSchema`, `postOfferSchema`, `studioPostSchema.offer`, error `OFFER_REQUIRES_PREMIUM`

### Security
- [x] Input validated (whole numbers, 1–10,000 Koin, 1–365 days); server derives `duration_seconds`
- [x] Raw SQL is a tagged template (parameterized)
- [x] CSRF covered by the global guard (wrong Origin → 403 tested)

### Creator / user isolation
- [x] Lock query filters `creator_profile_id`; foreign post = same 404 as unknown (tested); non-creator 403, no session 401

### Financial Integrity
- [x] Koin stored as `BIGINT`, compared as `BigInt`; JSON conversion `Number()` is exact under the 10,000 cap (commented)
- [x] Append-only: no update/delete path; earlier versions verified byte-identical after later changes
- [x] Version allocation under `SELECT … FOR UPDATE` on the post row; UNIQUE `(post_id, version)` backstop; 3 concurrent PUTs → versions 1,2,3
- [x] DB CHECKs `price_coins > 0`, `duration_seconds > 0`, `version >= 1` (tested via raw insert)
- N/A purchases (later story snapshots the referenced row)

### Code Quality
- [x] One `currentOffer` include reused by create/list/get; identical-terms resubmit is a no-op

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Whole-Koin price + duration within configured limits | PASS | Shared schema on API (web in TASK-053) |
| 2 | Price > 0, duration positive | PASS | Zod + DB CHECKs |
| 3 | Change creates a new version for future purchases | PASS | v1→v2→v3, any post status incl. PUBLISHED |
| 4 | Existing buyers keep terms | PASS (data side) | Older rows immutable; purchase snapshot lands with the unlock story |

## Tests Run

- [x] `packages/shared/src/posts.test.ts`: 11 new `setPostOfferSchema` boundary cases
- [x] `post-offers.integration.spec.ts` (new, ids `…1f…`): first offer + get/list, identical terms no-op, versioning with v1 untouched, published post, concurrency, FREE → 409, 6 validation cases, isolation/auth/CSRF, DB CHECKs + unique
- [x] `posts.integration.spec.ts` updated for `offer: null`; web fixtures given `offer: null`
- [x] `pnpm check` PASS: shared 153, web 125, api 369

## Notes
- Web StudioPost fixtures (`post-form.test.tsx`, `studio-posts.test.ts`) were updated here instead of in TASK-053 so `pnpm check` stays green.
