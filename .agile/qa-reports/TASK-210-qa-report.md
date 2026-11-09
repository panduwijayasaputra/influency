# QA Report: TASK-210 — GET /me/earnings balance

**Result:** PASS (2026-11-09)

## Checked
- `GET /api/v1/me/earnings` (`ApprovedCreatorGuard`; guest 401, unapproved 403 `CREATOR_NOT_APPROVED`, `no-store`, exactly the six contract fields). `EarningsService.balanceInTx(db, creatorProfileId)` is one SQL statement over the caller's CREATOR ledger rows (summed per source) and payouts, in integer BigInt IDR, converted with `toSafeInt`; amounts beyond 32 bits work.
- Rules (13 tests, run through the service with the HTTP layer checked separately): matured = `accrues_at + 14 days` passed, pending = the rest; PLATFORM rows ignored; a scheduled subscription period matures 14 days after it starts; a cancelled scheduled renewal (SALE + REVERSAL) nets to zero and is never the next maturity; a reversed sale nets to zero; available = matured − REQUESTED − PAID_OUT with CANCELED ignored; never negative (clamped to 0 and logged as an error naming the creator); `nextMaturityIdr` sums by Asia/Jakarta calendar day (times chosen so a UTC-day implementation fails); another creator's sales and payouts never leak. The exact pending → available boundary is tested with a 2-second wait on the database clock.
- The same computation is exposed as `balanceInTx` for the payout request transaction (US-063), which will call it after locking the creator row.
- Web: `fetchEarnings` is the real call (`GET`, parsed with the shared schema); the balance dummy is gone. Full `pnpm check` passes twice: shared 306, API 1173 (98 files), web 885 (116 files).

## Important finding (fixed here, affects US-061 and the rest of the app)
- **A JS `Date` written through Prisma is stored away from the instant it meant by the database session offset** (here `Asia/Bangkok`, +7 h: `2026-11-10T05:00Z` is stored as `2026-11-10 05:00:00+07`). Reading it back through a Prisma model undoes the shift, so the app is self-consistent in JS, but SQL that compares such a column with `now()` is wrong by that offset. My first version of the query matured every earning 7 hours early on this setup (the boundary and calendar-day tests caught it).
- Fix: `writtenInstant(column)` in `common/db-time.ts` turns the stored value back into the intended instant (a no-op when the session runs in UTC). It has a regression test, including one that pins the raw stored offset. Use it for any SQL that compares a JS-written timestamptz with the database clock (US-061 needs it).
- Recommended follow-up (not done here, out of scope): decide the platform rule — e.g. an ADR to run both Prisma clients with a UTC session time zone — because other code that compares JS-written columns with `now()` in SQL would have the same issue.

## Other fixes made so `pnpm check` passes
- My new specs reused fixed user-id prefixes that `post-offers` and `post-comment-replies` already owned (my duplicate-check grep had a wrong pattern); moved to unused prefixes.
- `creator-follows.integration.spec.ts` and `post-comments.integration.spec.ts` already shared the ids `…000000290001–4` (an existing latent collision that only failed once the extra spec files changed the scheduling); `creator-follows` moved to `0000003c`.
- The auth spec compares a global `session.count()` across a request; the earnings spec therefore creates its sessions once in `beforeAll` and runs the math through the service.
- My specs' approved creators use `LEFTOVER_CREATED_AT`, so they do not crowd the 15-item recommended list that other specs assert on.

## Notes
- Until US-063 / US-064 the payout request, quote and cancel still run on an in-memory dummy with its own balance, so after "Ajukan pencairan" the real balance (reloaded from the API) does not change.
- Other prefixes are still shared between spec files (e.g. `00000024`, `0000000f`, `00000042`); they have not failed, so they were left alone.
