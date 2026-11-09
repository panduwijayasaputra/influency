# Technical Plan: US-031 — Credit Koin from Verified Midtrans Notification

## Architecture Overview

`POST /webhooks/payments/midtrans` (under the `/api/v1` prefix, next to `webhooks/video`). Flow:

1. Parse the JSON body with `midtransNotificationSchema` (TASK-152). Invalid shape → 400, nothing stored.
2. **Store first:** insert into `payment_webhook_events` (`ON CONFLICT (fingerprint) DO NOTHING`). If the insert throws → 500 so Midtrans retries.
3. Verify the signature with `verifyMidtransSignature(n, gateway.signatureKey)`. Invalid → event `outcome = 'REJECTED_SIGNATURE'`, respond 401, no order change.
4. `TopupsService.applyProviderStatus(n, source: 'NOTIFICATION')` — the single entry point shared with reconciliation (US-032). Duplicates go through it too (fingerprint dedupe only avoids extra rows, it never skips processing), and it is idempotent.
5. Store the outcome on the event and respond 200 `{ ok: true }`.

**`applyProviderStatus` = creditOnce** — one `prisma.$transaction`:
- `SELECT … FROM topup_orders WHERE order_number = $1 FOR UPDATE` (lock order **first**, the wallet second inside `creditInTx`). Unknown order → outcome `UNKNOWN_ORDER` (200; Midtrans dashboard test pings use made-up ids).
- **Match checks** (quarantine on any mismatch, no credit, status unchanged): `gross_amount` must parse as an integer rupiah string (`/^\d+(\.00)?$/`) equal to `total_idr`; `currency`, when present, `=== 'IDR'`; `merchant_id`, when present, `=== gateway.merchantId`; `transaction_id` must not belong to another order.
- Map with `mapMidtransStatus(transaction_status, fraud_status)` (pure):
  | Midtrans | Result |
  |---|---|
  | `settlement` | SUCCESS |
  | `capture` + `fraud_status` `accept` (or absent) | SUCCESS |
  | `capture` + `challenge` | PENDING |
  | `capture` + `deny`, `deny`, `failure` | FAILED |
  | `pending`, `authorize` | PENDING |
  | `expire` | EXPIRED |
  | `cancel` | CANCELED |
  | `refund`, `partial_refund`, `chargeback`, `partial_chargeback` | REVIEW |
  | anything else | REVIEW |
  The dev confirms the table against the current Midtrans "Transaction Status" docs and notes any difference.
- Transition rules (terminal states never move backwards):
  | Current \ Result | SUCCESS | PENDING | FAILED/EXPIRED/CANCELED | REVIEW |
  |---|---|---|---|---|
  | CREATED/PENDING | **credit** → CREDITED | PENDING (update provider fields) | that status | quarantine |
  | CREDITED | no-op (`ALREADY_CREDITED`) | no-op | no-op (log) | quarantine (refund/chargeback need finance) |
  | FAILED/EXPIRED/CANCELED | quarantine (`PAID_AFTER_TERMINAL`, money received but no auto credit) | no-op | no-op | quarantine |
- **credit:** `walletsService.creditInTx(tx, { userId, coins, entryType: 'TOPUP_CREDIT', sourceType: 'TOPUP_ORDER', sourceId: order.id, basisIdr: order.priceIdr })`, then update the order: `status CREDITED`, `paidAt` (Midtrans `settlement_time`/`transaction_time` parsed as Asia/Jakarta → UTC, else DB now), `creditedAt = now()`, `providerTransactionId`, `providerStatus`, `paymentType`. The unique source key on the ledger is the last line of defence against a double credit.
- Quarantine = set `quarantinedAt` (first time only) + `quarantineReason`; no ledger entry.

Outbox / Telegram notification for a successful top-up is out of scope here (no outbox exists yet; `discover-notifications-settings` adds it).

## Dependencies

- One Prisma migration (`payment_webhook_events`).
- Raw body is already available to controllers (`RawBodyRequest`, used by the video webhook); this endpoint reads the parsed JSON body only, since the Midtrans signature is over fields, not bytes.

## Risks

- **Concurrent duplicates:** the order row lock serialises them; the second sees `CREDITED` and no-ops. Tested with 10 parallel requests.
- **200 before durable storage:** the event insert happens before any processing; any error after it → 500 (Midtrans retries), and processing is idempotent.
- **CSRF guard:** the webhook carries no session cookie, so `CsrfGuard` skips it; a test sends it without `Origin`.

## Tasks

### TASK-155: Webhook event store, status mapping and creditOnce

**Prisma** — migration `pnpm db:migrate --name payment_webhook_events`:
```prisma
model PaymentWebhookEvent {      // payment_webhook_events
  id, provider String,             // 'midtrans' (notification) | 'midtrans_status' (US-032 status check)
  orderNumber String @map("order_number"),
  fingerprint String @unique,      // sha256hex(order_id|transaction_status|status_code|transaction_id|fraud_status|gross_amount)
  signatureValid Boolean, payload Json, outcome String?, receivedAt @default(now()), processedAt DateTime?
  @@index([orderNumber])
}
```
Do not store the request headers. `payload` contains no secrets (`signature_key` is a hash).

**`apps/api/src/modules/topups/midtrans.ts`** (pure, unit-tested in `midtrans.spec.ts`): `mapMidtransStatus`, `parseGrossAmountIdr(s): bigint | null`, `parseMidtransTime(s): Date | null` (format `YYYY-MM-DD HH:mm:ss`, Asia/Jakarta = UTC+7), `notificationFingerprint(n)`.

**`TopupsService.applyProviderStatus(n: MidtransNotification, source: 'NOTIFICATION' | 'STATUS_CHECK'): Promise<ApplyOutcome>`** with `ApplyOutcome = 'CREDITED' | 'ALREADY_CREDITED' | 'STATUS_UPDATED' | 'NO_CHANGE' | 'QUARANTINED' | 'UNKNOWN_ORDER'`, implemented exactly per the overview tables. Lock with `tx.$queryRaw` (`SELECT id, status, … FROM topup_orders WHERE order_number = ${n.order_id} FOR UPDATE`). Logs: order number, outcome, mapped status — never the payload or keys.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/prisma/schema.prisma` + migration `<ts>_payment_webhook_events` | Event store |
| MODIFY | `apps/api/src/modules/topups/midtrans.ts` (+ `midtrans.spec.ts`) | Mapping, parsing, fingerprint |
| MODIFY | `apps/api/src/modules/topups/topups.service.ts` | `applyProviderStatus` |
| CREATE | `apps/api/src/modules/topups/credit-once.integration.spec.ts` | Service-level tests |

**Testing:**
- unit: every row of the mapping table; `"10000.00"` → 10000n, `"10000.50"`/`"abc"` → null; Jakarta time conversion; fingerprint stable across key order.
- integration (service, real DB, orders created via TASK-153 service with the fake gateway): `settlement` credits exactly `coins` (ledger entry + lot + balance + `CREDITED` + timestamps); same notification again → `ALREADY_CREDITED`, balance unchanged; `capture`(accept) then `settlement` → one credit; **10 concurrent** `applyProviderStatus` with `settlement` → balance = coins once, one ledger entry, one lot; `pending` → PENDING; `expire` → EXPIRED, then `settlement` → QUARANTINED, no credit; `deny` → FAILED; amount `"25000.00"` on a 10-Koin order → QUARANTINED, no credit; foreign `merchant_id` → QUARANTINED; `refund` on a CREDITED order → QUARANTINED, balance unchanged; unknown order → `UNKNOWN_ORDER`.

---

### TASK-156: Midtrans notification endpoint

**`apps/api/src/modules/topups/midtrans-webhook.controller.ts`** — `@Controller('webhooks/payments')`, `@Post('midtrans')`, no session guard, `RateLimitGuard` with `@RateLimit({ max: 300, timeWindow: '1 minute' })` (keyed by IP), `@HttpCode(200)`. Steps 1–5 of the overview; the event insert and `applyProviderStatus` go through a small `TopupsService.handleNotification(body)` so the controller stays thin. Invalid signature → `DomainError('PAYMENT_VERIFICATION_FAILED')` but with HTTP **401**: change `PAYMENT_VERIFICATION_FAILED` status in `packages/shared/src/errors.ts` from 400 to 401 (no other user yet — grep to confirm).

Add an OpenAPI note that the endpoint is provider-only.

**Docs:** extend `docs/payments.md` (TASK-154) with the webhook URL and how to send a Sandbox test notification through a tunnel.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/topups/midtrans-webhook.controller.ts` | Endpoint |
| MODIFY | `apps/api/src/modules/topups/topups.module.ts` | Register controller |
| MODIFY | `apps/api/src/modules/topups/topups.service.ts` | `handleNotification` |
| MODIFY | `packages/shared/src/errors.ts` | 401 for verification failure |
| CREATE | `apps/api/src/modules/topups/midtrans-webhook.integration.spec.ts` | HTTP tests |
| MODIFY | `docs/payments.md` | Webhook instructions |

**Testing (Fastify inject, fake gateway; notifications signed with `signMidtrans(…, 'fake-server-key')`):** valid `settlement` → 200 and balance credited; the same body 10× concurrently → one credit, one event row (fingerprint), all 200; `capture` then `settlement` → one credit; bad signature → 401, event stored with `signatureValid=false`, order unchanged; wrong amount → 200, order quarantined, `GET /wallet/topups/:id` shows `UNDER_REVIEW`; malformed body → 400; no session cookie and no `Origin` header still accepted; simulated DB failure on the event insert (spy throwing) → 500; **redirect is not payment:** calling the web finish URL / `GET /wallet/topups/:id` without any notification leaves balance 0.
