# QA Report: TASK-211 — Earnings activity endpoint + web wiring

**Result:** PASS (2026-11-09)

## Checked
- `GET /api/v1/me/earnings/activity?type=all|subscription|unlock|tip&cursor=` (`ApprovedCreatorGuard`, `no-store`): the caller's CREATOR revenue rows, newest first, 20 per page (`WALLET_PAGE_SIZE`, the wallet ledger convention), keyset-paged on `(created_at, id)` with the wallet cursor format `<ms>_<uuid>` (`decodeLedgerCursor` / `formatLedgerCursor` added next to the existing codec). The cursor is compared as integer epoch milliseconds, never as a JS `Date` parameter.
- Each item: id, type (unlock / subscription / tip), kind (SALE / REVERSAL), `occurredAt`, buyer display name, caption excerpt (first non-empty line, 60 characters + ellipsis, emoji-safe; null for a creator tip), gross Koin, fee bps, net IDR (the stored CREATOR amount, not recomputed; a cancelled renewal shows a SALE and a negative REVERSAL), status by the database clock and `availableAt` = accrual + 14 days. A scheduled period is PENDING until 14 days after it starts.
- Tested with real source rows (post purchase, subscription period, tip) joined to real ledger rows: per-type filters; pagination of 25 rows that all share one `created_at` (no gaps or repeats), exactly one page has no next cursor, a sale arriving between pages does not leak into page 2, filter + paging together.
- Privacy / isolation: another creator's rows never appear; only the contract fields leave the API (the buyer id and the source id are asserted absent from the JSON). The buyer is a LEFT JOIN with a generic "Pengguna" fallback, so a sale can never disappear from a creator's history.
- Validation: unknown type, malformed cursor, cursor with a bad id and empty cursor → 400 `VALIDATION_FAILED`; guest 401; unapproved 403 `CREATOR_NOT_APPROVED`.
- Web: `fetchEarningsActivity` is the real call (type and cursor in the query string, parsed with the shared schema); the activity dummy and its fixtures are gone.
- Full `pnpm check` passes: shared 306, API 1212 (100 files), web 882 (116 files).

## Finding (extends the US-060 one)
- `occurredAt` was first off by exactly 7 hours: `createdAt @default(now())` is filled in by Prisma from JS, so it is stored shifted by the DB session offset like any other JS Date (only a row inserted by raw SQL gets the true database default). The query now normalises it with `writtenInstant`; the `db-time` spec pins this, and the doc comment on `writtenInstant` no longer claims defaulted columns are exempt. Any later SQL that reads `created_at` / `updated_at` of a Prisma-written row as an instant (US-064 payout list) must do the same.

## Notes
- A pre-existing flaky web test, `post-media-viewer.test.tsx` (different test each time, async `waitFor` under parallel load), failed in 1 of 2 full runs and passed in the other; it is untouched by this feature.
