# QA Report: TASK-058 — Permanent offers: shared contract, migration and API

**Story:** US-046
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Shared `setPostOfferSchema` is the single rule for API + web: `z.strictObject({ priceCoins })`, int 5–1,000 (LOCKED constants)
- [x] Migration committed and hand-edited with a header comment (same convention as US-018); Prisma client regenerated
- [x] `setOffer` keeps the post-row lock, PREMIUM check and version append; only the duration comparison was removed

### Security
- [x] Owner scoping unchanged (foreign/unknown → 404, plain user 403, no session 401, bad Origin 403 — test kept)
- [x] Stale `durationDays` is rejected with 400 `VALIDATION_FAILED`, not silently ignored

### Financial Integrity
- [x] Prices are integers (BIGINT), now bounded by DB CHECK `post_offers_price_coins_range` (5–1,000)
- [x] Append-only versioning intact; the migration's one-time in-place clamp is documented and safe because no purchase table exists yet
- [x] An out-of-range offer can no longer be stored, so it cannot be published (AC 5 by construction); `OFFER_REQUIRED` unchanged

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | 4 rejected, 5 / 1,000 accepted, 1,001 rejected | PASS | Shared unit + API integration + DB CHECK tests |
| 2 | No access duration in the API | PASS | Column dropped; strict body; studio and public JSON asserted exactly (raw JSON, not Zod-stripped) |
| 3 | Price change → new version, future purchases only | PASS | v1 row unchanged after v2; same price keeps version; concurrent PUTs get versions 1–3 |
| 4 | Existing offers migrated | PASS | Applied to the dev DB holding seeded test offers 1 / 10,000 / 77 → 5 / 1,000 / 77; duration column gone (checked with a SQL assertion block) |
| 5 | Invalid offer can't be published | PASS | DB CHECK rejects raw inserts of 4 and 1,001 |

## Tests Run

- [x] `@influency/shared` tests: 162 passed
- [x] API `src/modules/posts`: 80 passed (6 files)
- [x] Typecheck + lint (shared, api), prettier on touched files: clean
- [ ] Web is updated in TASK-059 (it still imports removed duration exports until then)

## Issues (if any)

None.
