# QA Report: TASK-165 — Post purchase endpoint

**Result:** PASS

## Checked (financial integrity, isolation)

- **One transaction:** claim the Idempotency-Key → `pg_advisory_xact_lock` on (user, post) and `FOR SHARE` on the post row → load post, creator and the current (highest) offer → existing purchase? → validate → `debitInTx` → insert `post_purchases` → `postSaleInTx` → complete the key. Any `DomainError` rolls back the key claim too, so the same key works after a top-up (tested).
- **Price comes from the DB offer.** The client sends only `expectedPriceCoins`; a mismatch is `409 OFFER_CHANGED { priceCoins }` with no debit. The purchase row snapshots the offer id, price and `feeBps = 2000` (CHECK-ed, append-only trigger).
- **No double charge:** same key + same body replays the stored result; same key + different body is `DUPLICATE_REQUEST`; a new key for an owned post (also after the post was archived) returns `alreadyOwned: true` and the unchanged balance; 5 simultaneous requests with different keys produce one debit and one purchase. `UNIQUE (user_id, post_id)` is the backstop.
- **No overspend:** two different posts at once with Koin for one → one 200, one 402 `INSUFFICIENT_COINS { required: 25, available: 5 }`.
- **Rejections (no ledger rows):** guest 401; own post 400 `CANNOT_PURCHASE_OWN`; FREE and no-offer posts and archived posts `POST_NOT_AVAILABLE`; draft, removed, unknown/malformed id and suspended creator `NOT_FOUND`; missing key and bad body 400; cross-origin 403 (global CSRF guard). Rate limit: 20/min per user (TBD placeholder).
- **Isolation:** user A's purchase never creates one for user B; the buyer id always comes from the session.
- **Design note:** a replay reports `alreadyOwned: true` ("this response charged nothing"); the shared schema comment says so.

## Tests

`post-purchases.integration.spec.ts` (13 tests for this task: happy path with ledger, allocations, snapshot and revenue rows; replay; payload mismatch; existing purchase and archived; 5-way race; overspend race; insufficient then retry with the same key; `OFFER_CHANGED`; snapshot survives a later price change; rejection matrix; own post; auth/key/body/origin; isolation). `pnpm check` green.

## Notes

- No outbox event is written: the outbox table does not exist yet (feature #10 adds it). A `shortcut:` comment in the service says so.
