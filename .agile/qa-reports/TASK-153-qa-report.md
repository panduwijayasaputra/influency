# QA Report: TASK-153 — Create top-up and order status endpoints

**Result: PASS**

- `POST /wallet/topups`: step 1 is one transaction (claim `Idempotency-Key` → active package lookup → order insert with a `uuidv7()` id and `INF-<32 hex>` order number → key result); step 2 calls the gateway **outside** any transaction (no lock held across a provider call). Price, Koin and fee come from the package row (`fee = 0`); client `priceIdr` / `coins` / `amount` are stripped by the Zod body schema (tested).
- Replays: same key + payload → same order (201); different payload → 409 `DUPLICATE_REQUEST`; order still `CREATED` → 409 `REQUEST_IN_PROGRESS`; `FAILED` → 502 again. 5 concurrent identical requests → exactly one order row.
- Gateway failure → order `FAILED` (`GATEWAY_CREATE_FAILED`), 502 `PAYMENT_GATEWAY_UNAVAILABLE`, nothing credited; a fresh key starts a new attempt.
- `GET /wallet/topups/:id`: owner only; another user's order, a random id and a non-UUID are all 404 `TOPUP_NOT_FOUND`. A flagged (quarantined) order reads `UNDER_REVIEW` with no pay link even if it also failed/expired, since money may have arrived. `redirectUrl` only while payable. `GET /wallet/topups` lists the caller's PENDING orders.
- Guards: guests 401, rate limits on create (10/min) and reads (60/min), global CSRF guard rejects a cross-origin POST (403). All responses `no-store`.
- Review note: tests that mutate the shared seeded packages could flake other specs running in parallel, so the inactive-package case uses its own `coins: 7` row and the price-change case was dropped (the snapshot is asserted from the created order).
- 13 integration tests; api typecheck and lint clean.
