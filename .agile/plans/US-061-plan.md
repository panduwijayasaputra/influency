# Technical Plan: US-061 — Earnings Activity API

## Architecture Overview

`GET /me/earnings/activity?type=&cursor=` on the `earnings.controller.ts` from TASK-210. It is one keyset-paginated raw SQL query over the caller's `CREATOR` revenue rows, joined to the source for the buyer name and post caption:

```sql
SELECT r.id, r.kind, r.source_type, r.amount_idr, r.gross_idr, r.fee_bps, r.created_at, r.accrues_at,
       u.display_name AS buyer_name, p.caption AS post_caption,
       (r.accrues_at + make_interval(days => 14) <= now()) AS available
FROM revenue_ledger_entries r
LEFT JOIN post_purchases pp      ON r.source_type = 'POST_PURCHASE'       AND pp.id = r.source_id
LEFT JOIN subscription_periods sp ON r.source_type = 'SUBSCRIPTION_PERIOD' AND sp.id = r.source_id
LEFT JOIN tips t                  ON r.source_type = 'TIP'                 AND t.id = r.source_id
JOIN users u ON u.id = COALESCE(pp.user_id, sp.user_id, t.user_id)
LEFT JOIN posts p ON p.id = COALESCE(pp.post_id, t.post_id)
WHERE r.creator_profile_id = $1 AND r.account = 'CREATOR'
  [AND r.source_type = $type]
  [AND (r.created_at, r.id) < ($cursorTime, $cursorId)]
ORDER BY r.created_at DESC, r.id DESC
LIMIT $pageSize + 1
```

- **Cursor:** reuse the wallet keyset codec (`ledgerCursorSchema` / `encodeLedgerCursor` / `ledgerCursorWhere`, `<ms>_<id>`, exported from `modules/wallets`). If it can't be reused as-is, move the codec to `common/keyset-cursor.ts` and update the wallet imports. Page size = `WALLET_PAGE_SIZE` (20). A bad cursor → 400 `VALIDATION_FAILED`.
- **Mapping:**
  - `type`: POST_PURCHASE → unlock, SUBSCRIPTION_PERIOD → subscription, TIP → tip.
  - `grossKoin = gross_idr / 1000` (BigInt division; gross is always a whole Koin × 1000).
  - `netIdr = amount_idr` as stored (negative for a REVERSAL).
  - `postCaption`: the first line, trimmed to 60 chars with "…", or null.
  - `availableAt = accrues_at + 14d`; `status` from the SQL boolean (DB time).
- **Privacy:** only `display_name` leaves the API (no user id, username, Telegram data). Times are converted to epoch ms in SQL as in `library-query.ts`, to avoid the session time zone shift noted for `dbNow`.

## Dependencies

- TASK-202 `earningsActivityQuerySchema` / `earningsActivityPageSchema`; TASK-210 controller/service.

## Risks

- **The `users.display_name` column name.** Check the actual column (the User model) before writing the SQL.
- **A public profile's caption for an archived/removed post** is still the creator's own content, so showing it in their own studio is fine.

## Tasks

### TASK-211: Earnings activity endpoint + web wiring

- **`EarningsService.activity(creatorProfileId, query: EarningsActivityQuery): Promise<EarningsActivityPage>`** running the SQL above with `Prisma.sql` fragments for the optional filters, fetching `pageSize + 1` to compute `nextCursor`.
- **`earnings.controller.ts`:** `@Get('activity')` with `@Query(new ZodValidationPipe(earningsActivityQuerySchema))`, `no-store`.
- **Web:** `fetchEarningsActivity(query)` in `lib/api/earnings.ts` → real `GET /api/v1/me/earnings/activity?type=&cursor=`, parsed with the schema. Delete the activity dummy and its fixtures.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/modules/payouts/earnings.service.ts`, `earnings.controller.ts` | Activity |
| MODIFY | `apps/api/src/modules/wallets/*` or CREATE `apps/api/src/common/keyset-cursor.ts` | Shared cursor codec (only if needed) |
| CREATE | `apps/api/src/modules/payouts/earnings-activity.integration.spec.ts` | Tests |
| MODIFY | `apps/web/src/lib/api/earnings.ts` (+ test) | Real fetch |

**Testing** (integration; create real purchases, subscriptions and tips through the existing services or test helpers so the joins are real):
- Each type filter returns only its rows.
- 25 rows → pages of 20 + 5 without overlap or gaps, also with equal `created_at` (id tiebreak).
- A cancelled scheduled renewal shows a SALE and a negative REVERSAL.
- Status flips at `accrues_at + 14d` (DB time).
- `netIdr` equals the stored amount (e.g. a 25 Koin unlock → 20000).
- Another creator's rows are absent; no user ids appear in the JSON (assert the keys).
- A bad cursor / bad type → 400; guest 401; non-creator 403.
