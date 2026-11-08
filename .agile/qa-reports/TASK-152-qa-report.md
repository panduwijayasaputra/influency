# QA Report: TASK-152 — Top-up order schema, idempotency keys and payment gateway

**Result: PASS**

- Migrations `topup_orders` (orders, idempotency keys, CHECKs: positive coins/price, fee ≥ 0, `total = price + fee`, currency IDR, CREDITED ⇔ `credited_at`, key length 8–128) and `topup_provider_ref`. The second renames the provider id column to `provider_tx_ref` because the schema-conventions spec requires every `*_id` column to be a uuid. Written by hand (non-interactive Prisma refuses the unique-constraint warning); `migrate status` is clean and a drift check produced an empty migration (removed).
- Env: `PAYMENT_PROVIDER=fake|midtrans` (default fake), Midtrans keys required for `midtrans`, fake refused in production, `TOPUP_EXPIRY_MINUTES` 15–1440, `MIDTRANS_IS_PRODUCTION=true` still refused. `vitest.config.ts` pins `PAYMENT_PROVIDER=fake` so a local `.env` with Sandbox keys can never reach the real gateway from tests. `.env.example` defaults to `fake`.
- Gateway (`PAYMENT_GATEWAY`): `MidtransSnapGateway` (Sandbox URLs only, Basic auth, 10 s timeout, key never in errors) and `FakePaymentGateway` (signed notifications via `notification()`, `setStatus`, `failNextCreate`).
- Midtrans docs checked live (docs.midtrans.com, 2026-11-07), findings applied: Snap answers 201 `{token, redirect_url}`; `order_id` ≤ 50 chars of `[A-Za-z0-9-_~.]` (ours: `INF-` + 32 hex); `expiry.unit` is `minute`; item `name` ≤ 50; **not-found is a body `status_code: "404"`** (handled, plus a real HTTP 404); `capture` is card-only and counts as paid only with `fraud_status: accept` (applied in TASK-155).
- `IdempotencyService.claim/complete` (INSERT … ON CONFLICT DO NOTHING, then SELECT … FOR UPDATE): new / replay / `DUPLICATE_REQUEST`; 6 concurrent claims → exactly one new row.
- Tests: signature known vector (independently computed) + tamper cases, gateway with mocked fetch (URL, auth, body, failures, both not-found forms), idempotency, env. api/common 228/228; typecheck and lint clean.
