# Backend Guidelines — NestJS + Prisma

Applies to `apps/api` and `apps/worker`. Product rules come from the handoff (§§5–13); this file says how to implement them.

## Module structure

One NestJS module per domain under `apps/api/src/modules/<domain>/`:

```text
modules/wallets/
  wallets.module.ts
  wallets.controller.ts      # thin: parse, authorize, call service, map response
  wallets.service.ts         # business rules + transactions
  wallets.repository.ts      # optional, only when Prisma queries get non-trivial
  dto/                       # re-exports/derivations of schemas from packages/shared
  wallets.service.spec.ts    # unit tests
  wallets.integration.spec.ts  # Supertest integration tests (real Postgres)
```

Domains: `auth, users, creators, posts, media, wallets, coin-packages, topups, payments, subscriptions, entitlements, financial-ledger, payouts, telegram-bot, notifications, admin`.

- Controllers hold no business logic and never call Prisma directly.
- Cross-module calls go through the other module's exported service, not its tables. Financial modules (`wallets`, `financial-ledger`, `entitlements`) expose methods that accept a Prisma transaction client so a caller can compose one atomic purchase.
- Shared infrastructure (Prisma service, config, logger, request ID, error filter, guards) lives in `apps/api/src/common/`.

## Validation and contracts

- Request/response schemas are **Zod** schemas in `packages/shared`; the API validates every body, query and param with them (a Zod validation pipe). Web reuses the same schemas/types.
  Usage: `@Body(new ZodValidationPipe(createPostSchema)) body: CreatePostInput` (`common/zod-validation.pipe.ts`); failures become 400 `VALIDATION_FAILED` with `details.issues` (path + message).
- Throw `new DomainError('CODE', details?)` (`common/domain-error.ts`) for expected errors; add new codes with status + Bahasa message to `ERRORS` in `packages/shared/src/errors.ts`.
- Validate external payloads (Midtrans notifications, Telegram updates, OIDC claims) with Zod at runtime before use.
- Expose OpenAPI docs for the REST API.

## Errors

All errors use one shape (handoff §11.5):

```json
{ "error": { "code": "INSUFFICIENT_COINS", "message": "Saldo Koin tidak cukup.", "requestId": "req_...", "details": { "required": 5, "available": 3 } } }
```

- Error codes are an enum in `packages/shared` (`AUTH_REQUIRED`, `FORBIDDEN`, `CREATOR_NOT_APPROVED`, `POST_NOT_AVAILABLE`, `OFFER_CHANGED`, `ALREADY_ENTITLED`, `INSUFFICIENT_COINS`, `TOPUP_NOT_FOUND`, `PAYMENT_PENDING`, `PAYMENT_VERIFICATION_FAILED`, `DUPLICATE_REQUEST`, `PAYOUT_ON_HOLD`, ...).
- Services throw a `DomainError(code, details)`; a global filter maps it to HTTP status + body. Unknown errors become a generic 500 without internals.
- User-facing messages in Bahasa Indonesia; codes and logs in English.

## Database (Prisma)

- UUID primary keys; `timestamptz` in UTC; snake_case table/column names via `@@map`/`@map`.
- Koin as `BigInt`/`Int` (integer), IDR as integer rupiah, commission as integer basis points. **Never** `Float`/`Decimal` math in JS for money.
- Every schema change ships with a migration in the same task. Never edit an applied migration.
- Unique constraints from handoff §10.1 are part of the spec, not optional (provider subject, slug, order number, provider transaction ID, ledger idempotency key, purchase idempotency key, credit source).
- Add `CHECK` constraints (e.g. `balance_coins >= 0`, `price_coins > 0`) via SQL in migrations — but never rely on them alone for race safety.
- Seed script creates demo data from handoff §15.5 (creators `claudiandreya`, `creatorb`, subscribers A/B, admin, free + premium posts, one active plan, example coin packages labeled `EXAMPLE`).

## Financial transactions (blocker rules)

Applies to wallet, top-up, payment, purchase, subscription, revenue, refund and payout code.

1. **Ledger-only balances.** A balance changes only by inserting a `coin_ledger` row; the cached `coin_wallets.balance_coins` is updated in the same transaction. No other code path writes balances.
2. **One transaction per business operation.** Use `prisma.$transaction(async (tx) => ...)` and lock the wallet row (`SELECT ... FOR UPDATE` via `tx.$queryRaw`) or run at Serializable isolation with retry on serialization failure. Unlock/subscribe writes debit + `content_purchases` + entitlement/subscription + lot allocations + `revenue_ledger` + outbox event together.
3. **Idempotency.** Purchase and top-up creation require an `Idempotency-Key` header: store key + request fingerprint + user + result; same key/same payload returns the stored result, same key/different payload → `DUPLICATE_REQUEST`. Independently, DB unique source keys must make a duplicate financial event impossible.
4. **Snapshots.** Purchases record offer/plan version, price, duration and commission basis points at purchase time. Later edits never rewrite history.
5. **Append-only.** No updates/deletes on ledger rows. Corrections, refunds and admin goodwill are new entries with reason + actor + link to the original.
6. **Server time.** `now` comes from the server/DB, never the client. Entitlement `ends_at = purchased_at + duration` in UTC.
7. **No negative spendable balance.** Insufficient funds → `INSUFFICIENT_COINS` with required/available; no entitlement created.
8. Revenue is allocated only when Koin is spent, never on top-up. Earnings states: estimated/pending → available → paid / on_hold.
9. TBD business values (package prices, commission, payout rules) come from DB/config labeled as examples — never hardcoded constants.

## Payments (Midtrans Snap Sandbox)

- All gateway calls go through a `PaymentGatewayProvider` interface; `MidtransSnapProvider` is the real implementation, `FakeTopupProvider` exists for dev/tests and must refuse to load when `NODE_ENV=production`.
- Top-up creation reads the package from DB, snapshots coins + IDR, creates the order (`order_number` used as Midtrans `order_id`), then calls Snap with the Server Key (backend only).
- Webhook handler (`POST /webhooks/payments/midtrans`):
  1. Persist the raw event to `webhook_events` (fingerprint unique) before processing.
  2. Verify `signature_key = SHA512(order_id + status_code + gross_amount + ServerKey)` using exact payload strings; check order exists, amount and currency match the snapshot, merchant matches.
  3. Map provider status to the internal status machine (handoff §8.4). Credit only for `settlement` or an accepted `capture` per current Midtrans docs.
  4. `creditOnce(orderId)` in one transaction: mark paid/credited + ledger CREDIT + coin lot + outbox notification. Duplicate/out-of-order events are no-ops.
  5. Mismatch → quarantine/fraud flag, no credit. Return non-2xx only if the event could not be durably stored.
- Browser redirects/callbacks never credit. A reconciliation job and admin endpoint query the Midtrans status API for pending orders.
- Follow current official Midtrans docs; if they differ from the handoff, follow the docs and note the difference in the plan/QA report.

## Auth and authorization

- Telegram OIDC: Authorization Code + PKCE (S256), `state` and `nonce` bound to the login attempt, code exchange server-side, ID token verified against JWKS (issuer `https://oauth.telegram.org`, audience = client ID, exp/iat/nonce). Identity = `auth_identities (provider, provider_sub)`; never the username.
- Sessions are server-side (`sessions` table storing a token hash); cookie is HttpOnly, Secure on HTTPS, SameSite=Lax; logout revokes the row. Provider tokens never reach the browser.
- `returnTo` accepts only same-origin relative paths.
- Guards: `SessionGuard` (authenticated), `RolesGuard` (`ADMIN`), `ApprovedCreatorGuard` (approved `creator_profiles` row). Roles come from the DB, never from token claims.
- **Ownership on every query:** studio endpoints filter by the session's creator id; user endpoints by the session's user id. A wrong-owner id returns 404, not someone else's data. Public ids are identifiers, not access tokens.
- Rate-limit auth, top-up, purchase, upload, payout and webhook endpoints.

## Media

- Uploads: API validates owner, mime type, size; issues a scoped presigned R2 PUT (or Stream direct upload); server re-validates bytes after upload.
- Reads: `GET /posts/:id/media-access` runs the entitlement check (handoff §6.4), then mints a short-lived presigned GET / Stream signed token. Never include these URLs in public responses, SSR HTML or logs.
- Public previews/thumbnails are separate, deliberately-created assets.

## Jobs, outbox, notifications

- Write `outbox_events` in the same transaction as the financial change; the worker publishes them to BullMQ. Notification failure never rolls back money.
- Jobs are idempotent (`notification_jobs.idempotency_key`), use backoff, and stop retrying on permanent failures (e.g. Telegram 403 → disable Telegram delivery for that user).
- Bot messages contain a summary + link to the website only — no premium media, no payout details.

## Logging

Structured JSON with `requestId`. Never log tokens, ID tokens, session cookies, Server Key, webhook secrets, signed media URLs or full PII.

## Testing

- **Unit (Vitest):** pure business rules — slug validation, entitlement predicate, fee calculation in basis points, FIFO lot allocation, status mapping, OIDC token validation failures.
- **Integration (Vitest + Supertest, real Postgres):** endpoints including auth/ownership failures; run against a test database reset per suite.
- **Financial/concurrency:** every scenario in handoff §15.2–15.3 that the task touches — duplicate webhooks (10x), capture→settlement, spoofed signature, wrong amount, concurrent unlocks with balance for one, duplicate idempotency key.
- Test against the real database for transactions/locking; mock only external providers (Midtrans, Telegram, R2/Stream).
