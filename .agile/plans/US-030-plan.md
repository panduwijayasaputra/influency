# Technical Plan: US-030 — Create Top-Up Order (Midtrans Snap Sandbox)

## Architecture Overview

New `topups` module (`apps/api/src/modules/topups/`) owns top-up orders, the payment gateway, the Midtrans webhook (US-031) and reconciliation (US-032). It imports `WalletsModule` for `creditInTx`.

**Gateway** — `PAYMENT_GATEWAY` token in `apps/api/src/common/payment-gateway.ts`, chosen in `CommonModule` like `VIDEO_PROVIDER`:
- `PAYMENT_PROVIDER=fake` (default; tests, CI, offline dev) → `FakePaymentGateway`; refused by env validation when `NODE_ENV=production`.
- `PAYMENT_PROVIDER=midtrans` → `MidtransSnapGateway` (Sandbox only; `MIDTRANS_IS_PRODUCTION` is already forced to `false` in `env.ts`). Local dev uses real Sandbox keys (agreed); the credit then arrives through the status check in US-032, so no tunnel is needed.

**Checkout = Snap redirect** (agreed in US-028): the API returns Snap's `redirect_url`; Snap's `callbacks.finish` is `${WEB_ORIGIN}/wallet/topups/{orderId}`. The web app never needs the client key or Snap JS. (Deviation from the guideline's "Snap JS" wording; noted, both are official Snap integrations.)

**Idempotency** — generic `idempotency_keys` table + `IdempotencyService` in `common/` (agreed), reused by `purchases`.

**Create flow** `POST /wallet/topups` (`Idempotency-Key` required):
1. `tx1` (one transaction): claim the key (`INSERT … ON CONFLICT DO NOTHING`, then `SELECT … FOR UPDATE`); if it already existed → same request hash? return the stored order : `DUPLICATE_REQUEST`. Otherwise load the active package (else `PACKAGE_NOT_AVAILABLE`), insert the order `CREATED` with the snapshot, store `{ orderId }` as the key's result.
2. Outside the transaction: `gateway.createCheckout(...)`. Success → order `PENDING` + `redirect_url`, `expires_at`. Failure → order `FAILED` (`failure_reason = 'GATEWAY_CREATE_FAILED'`) and `PAYMENT_GATEWAY_UNAVAILABLE` (502).
3. Replay of a known key: order `PENDING` → `{ orderId, redirectUrl }`; `FAILED` → `PAYMENT_GATEWAY_UNAVAILABLE`; still `CREATED` (first call in flight) → `REQUEST_IN_PROGRESS` (409).

## Dependencies

- One Prisma migration. No new npm packages (`fetch` + `node:crypto`).
- Midtrans Sandbox keys in the developer's local `.env` for the manual check (never committed).

## Risks

- **Midtrans API drift:** the dev reads the current Snap docs (docs.midtrans.com → Snap → Backend Integration) before coding and notes any difference from this plan in the QA report. Do not invent fields.
- **Gateway timeout leaves CREATED orders:** reconciliation (US-032) expires stale `CREATED` orders; replay returns `REQUEST_IN_PROGRESS` meanwhile.
- **Secrets:** Server Key only in `MidtransSnapGateway`; never logged (log order number + HTTP status only).

## Tasks

### TASK-152: Top-up order schema, idempotency keys and payment gateway

**Env** (`apps/api/src/common/env.ts` + `env.spec.ts`, `.env.example`):
- `PAYMENT_PROVIDER: z.enum(['fake','midtrans']).default('fake')`; superRefine: `midtrans` requires `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_MERCHANT_ID` (`MIDTRANS_VARS` const like `STREAM_VARS`); `fake` + `NODE_ENV=production` → issue "fake payments are for development/test only".
- `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_MERCHANT_ID` optional strings.
- `TOPUP_EXPIRY_MINUTES` int 15–1440, default 60 — `// TBD placeholder: how long a top-up checkout stays payable`.
- `.env.example`: change to `PAYMENT_PROVIDER=fake` with a comment ("set to midtrans with your Sandbox keys to test checkout"); keep the placeholders; remove `MIDTRANS_WEBHOOK_URL` if nothing reads it (the URL is configured in the Midtrans dashboard) or keep it documented-only.

**Prisma** — migration `pnpm db:migrate --name topup_orders`:

```prisma
enum TopupStatus { CREATED PENDING CREDITED FAILED EXPIRED CANCELED  @@map("topup_status") }

model TopupOrder {                       // topup_orders
  id, userId (FK RESTRICT), packageId (FK RESTRICT),
  orderNumber String @unique @map("order_number"),        // "INF-" + id without dashes; Midtrans order_id
  coins BigInt, priceIdr BigInt, feeIdr BigInt @default(0), totalIdr BigInt, currency String @default("IDR"),
  status TopupStatus @default(CREATED),
  providerStatus String?, providerTransactionId String? @unique, paymentType String?,
  redirectUrl String?, expiresAt DateTime?,
  paidAt DateTime?, creditedAt DateTime?, failureReason String?,
  quarantinedAt DateTime?, quarantineReason String?,
  checkAttempts Int @default(0), nextCheckAt DateTime?, lastCheckedAt DateTime?,
  createdAt, updatedAt
  @@index([userId, createdAt(sort: Desc)])
  @@index([status, nextCheckAt])
}

model IdempotencyKey {                   // idempotency_keys
  id, userId (FK RESTRICT), scope String, key String, requestHash String, resultId String? @db.Uuid, createdAt
  @@unique([userId, scope, key])
}
```
Raw-SQL CHECKs: `coins > 0`, `price_idr > 0`, `fee_idr >= 0`, `total_idr = price_idr + fee_idr`, `currency = 'IDR'`, `(status = 'CREDITED') = (credited_at IS NOT NULL)`, `char_length(key) BETWEEN 8 AND 128`. Then `generate`.

Note: there is no stored `PAID` state — paid and credited happen in one transaction (US-031), so `paid_at` and `credited_at` are both set when the status becomes `CREDITED`. This is a simplification of handoff §8.4; note it in `docs/` payment notes.

**`apps/api/src/common/idempotency.ts`** — `IdempotencyService` (provided + exported by `CommonModule`):
```ts
/** Inside the caller's tx. Returns { status: 'new' } or { status: 'replay', resultId } ; throws DUPLICATE_REQUEST on a different hash. */
claim(tx, { userId, scope, key, requestHash }): Promise<{ status: 'new' } | { status: 'replay'; resultId: string | null }>
complete(tx, { userId, scope, key, resultId }): Promise<void>
```
`claim`: `INSERT … ON CONFLICT (user_id, scope, key) DO NOTHING RETURNING id`; if no row returned, `SELECT … FOR UPDATE` the existing row and compare `request_hash`. Helper `requestHash(body: unknown) = sha256hex(stableJson(body))` (sorted keys). Header parsing helper `parseIdempotencyKey(header)`: required, 8–128 chars `[A-Za-z0-9_-]`, else `VALIDATION_FAILED` with `details: { header: 'Idempotency-Key' }`.

**`apps/api/src/common/payment-gateway.ts`:**
```ts
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
export interface CheckoutInput { orderNumber: string; grossIdr: number; itemName: string; customerName: string; finishUrl: string; expiryMinutes: number }
export interface PaymentGateway {
  readonly merchantId: string;
  /** Throws PaymentGatewayError on any non-success. */
  createCheckout(input: CheckoutInput): Promise<{ token: string; redirectUrl: string }>;
  /** Transaction status (US-032); null when the provider has no transaction yet (404). */
  getStatus(orderNumber: string): Promise<MidtransNotification | null>;
  /** Key used by verifyMidtransSignature (Server Key, or the fake key). */
  readonly signatureKey: string;
}
export class PaymentGatewayError extends Error {}
```
`midtransNotificationSchema` (Zod, in `apps/api/src/modules/topups/midtrans.ts`, used by US-031/032): `order_id`, `status_code`, `gross_amount` (string), `signature_key`, `transaction_status`, `transaction_id`, optional `fraud_status`, `currency`, `merchant_id`, `payment_type`, `settlement_time`, `transaction_time`; `.passthrough()` for storage.

- `apps/api/src/common/midtrans-snap-gateway.ts` — `MidtransSnapGateway(env)`: base URLs `https://app.sandbox.midtrans.com/snap/v1/transactions` and `https://api.sandbox.midtrans.com/v2/{order_id}/status` (constants; there is no production branch). Auth `Basic base64(serverKey + ':')`, `Accept`/`Content-Type: application/json`, `AbortSignal.timeout(10_000)`. Snap body: `{ transaction_details: { order_id, gross_amount }, item_details: [{ id: orderNumber, price: grossIdr, quantity: 1, name: itemName }], customer_details: { first_name: customerName }, callbacks: { finish: finishUrl }, expiry: { unit: 'minutes', duration: expiryMinutes } }`. Response parsed with Zod `{ token, redirect_url }`. `getStatus`: 404 or body `status_code: "404"` → `null`; otherwise parse `midtransNotificationSchema`.
- `apps/api/src/common/fake-payment-gateway.ts` — `FakePaymentGateway(env)`: `merchantId = 'FAKE-MERCHANT'`, `signatureKey = 'fake-server-key'`; `createCheckout` returns `{ token: 'fake-<orderNumber>', redirectUrl: <finishUrl> }` (goes straight to the status page); test controls `failNextCreate()`, `setStatus(orderNumber, partialNotification | null)` (fills `signature_key` using `signMidtrans` so verification runs for real), `getStatus` returns the stored value or null.
- `apps/api/src/common/midtrans-signature.ts`: `signMidtrans(orderId, statusCode, grossAmount, key) = sha512hex(orderId + statusCode + grossAmount + key)`; `verifyMidtransSignature(n, key)` → `timingSafeEqual` on equal-length hex buffers.
- `CommonModule`: provide `PAYMENT_GATEWAY` by `env.PAYMENT_PROVIDER`; export it and `IdempotencyService`.

**Shared errors** (`packages/shared/src/errors.ts`): `PACKAGE_NOT_AVAILABLE` (404, "Paket Koin tidak tersedia."), `REQUEST_IN_PROGRESS` (409, "Permintaan sebelumnya masih diproses. Coba lagi sebentar."), `PAYMENT_GATEWAY_UNAVAILABLE` (502, "Layanan pembayaran sedang tidak tersedia. Coba lagi nanti."). `TOPUP_NOT_FOUND`, `DUPLICATE_REQUEST` already exist.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/common/env.ts` (+ `env.spec.ts`), `.env.example` | Payment config |
| MODIFY | `apps/api/prisma/schema.prisma` + migration `<ts>_topup_orders` | Orders, idempotency keys |
| CREATE | `apps/api/src/common/idempotency.ts` (+ integration spec) | Generic idempotency |
| CREATE | `apps/api/src/common/payment-gateway.ts` | Interface + token |
| CREATE | `apps/api/src/common/midtrans-snap-gateway.ts` (+ spec with mocked `fetch`) | Sandbox gateway |
| CREATE | `apps/api/src/common/fake-payment-gateway.ts` (+ spec) | Test/dev gateway |
| CREATE | `apps/api/src/common/midtrans-signature.ts` (+ spec) | SHA-512 sign/verify |
| CREATE | `apps/api/src/modules/topups/midtrans.ts` | Notification Zod schema |
| MODIFY | `apps/api/src/common/common.module.ts` | Providers |
| MODIFY | `packages/shared/src/errors.ts` | 3 codes |

**Testing:** env: `fake` in production rejected, `midtrans` without keys rejected; signature: known vector (compute once in the spec from the documented formula) verifies, one changed char fails, different-length signature fails without throwing; Midtrans gateway (mocked `fetch`): correct URL, Basic auth header, body shape, timeout/500 → `PaymentGatewayError`, status 404 → null, Server Key never in thrown error messages; idempotency (real DB): new → new, same hash → replay, different hash → `DUPLICATE_REQUEST`, two concurrent claims of one key → exactly one `new`.

---

### TASK-153: Create top-up and order status endpoints

**`apps/api/src/modules/topups/`:**
- `topups.module.ts` — imports `CommonModule`, `WalletsModule`; registered in `AppModule`.
- `topups.service.ts`:
  - `create(userId, packageId, idempotencyKey) → { orderId, redirectUrl }` — flow from the overview. `tx1` = `prisma.$transaction(async tx => { claim; package lookup (active); order insert with id = uuidv7 from DB then orderNumber = 'INF-' + id.replaceAll('-', ''); complete(resultId = order.id) })`. Get the id first with ``tx.$queryRaw`SELECT uuidv7()::text AS id` `` and insert the order with that `id` and its `order_number` in one statement (`order_number` stays NOT NULL). Snapshot from the package row only (`coins`, `priceIdr`, `feeIdr = 0`, `totalIdr = priceIdr`). Then `gateway.createCheckout({ orderNumber, grossIdr: totalIdr, itemName: `${coins} Koin`, customerName: user display name (truncate 50) , finishUrl: `${WEB_ORIGIN}/wallet/topups/${id}`, expiryMinutes: TOPUP_EXPIRY_MINUTES })`; success → `updateMany({ where: { id, status: 'CREATED' }, data: { status: 'PENDING', redirectUrl, expiresAt: now + expiry, nextCheckAt: now + 60 s } })`; `PaymentGatewayError` → `updateMany` to `FAILED` + throw `PAYMENT_GATEWAY_UNAVAILABLE`.
  - `getForOwner(userId, orderId) → TopupOrder` — `findFirst({ id, userId })` else `TOPUP_NOT_FOUND` (404 for other users' orders too). Public status mapping: `CREATED`/`PENDING` → `PENDING` (or `UNDER_REVIEW` when `quarantinedAt` set and not credited); others 1:1. `balanceCoins` = `WalletsService.getWallet` only when `CREDITED`. `redirectUrl` only while `PENDING` and `expiresAt > now`. (US-032 adds the on-demand status check here.)
  - `listPending(userId)` — `CREATED`/`PENDING` orders of the user, newest first, limit 5.
- `topups.controller.ts` (`@Controller('wallet/topups')`, `SessionGuard` + `RateLimitGuard`, `cache-control: no-store`):
  - `POST /wallet/topups` — `@RateLimit({ max: 10, timeWindow: '1 minute' })`; body `createTopupRequestSchema`; header via `parseIdempotencyKey`; any client `amount`/`price` field is ignored by the schema (Zod strips unknown keys) — add a test proving it. Returns 201 `createTopupResponseSchema`.
  - `GET /wallet/topups` → `pendingTopupsResponseSchema`.
  - `GET /wallet/topups/:id` — `id` validated as UUID (else 404 `TOPUP_NOT_FOUND`), `@RateLimit({ max: 60, timeWindow: '1 minute' })`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/topups/topups.module.ts` | Module |
| CREATE | `apps/api/src/modules/topups/topups.service.ts` | Create / read |
| CREATE | `apps/api/src/modules/topups/topups.controller.ts` | Endpoints |
| MODIFY | `apps/api/src/app.module.ts` | Register |
| CREATE | `apps/api/src/modules/topups/topups.integration.spec.ts` | Tests (fake gateway) |

**Testing (real Postgres, fake gateway):** creates order with DB price (body with `amount: 1` ignored) and returns redirect; snapshot unchanged after the package price is edited in the DB; inactive/unknown package → `PACKAGE_NOT_AVAILABLE`; missing / malformed header → 400; same key + same body → same `orderId`, one order row; same key + other package → `DUPLICATE_REQUEST`; 5 concurrent identical requests → 1 order; gateway failure → order `FAILED`, 502, replay → 502; replay while `CREATED` → `REQUEST_IN_PROGRESS`; status for owner, 404 for another user and for a non-UUID; guest → 401; no wallet movement anywhere in this task (balance stays 0).

---

### TASK-154: Wire checkout and status page to the top-up API

**`apps/web/src/lib/api/wallet.ts`:** replace the dummy `createTopup` (`POST /${API_PREFIX}/wallet/topups`, `credentials: 'include'`, headers `Content-Type` + `Idempotency-Key`), `fetchTopup` (404 → null), `fetchPendingTopups` with real calls parsed by the shared schemas. Non-OK → throw an `ApiError` carrying the shared error shape (reuse the existing web API error helper if one exists in `lib/api/`, else add a small `parseApiError(res)` there). Remove all remaining wallet dummies and `shortcut:` comments.

**`TopupSheet`:** map `REQUEST_IN_PROGRESS` → "Pesanan sebelumnya masih diproses…" (retry keeps the key), `PAYMENT_GATEWAY_UNAVAILABLE` → its message with a "Coba lagi" that uses a **new** key (the old order is FAILED), `RATE_LIMITED` → its message.

**Docs:** add a "Midtrans Sandbox top-up" section to `docs/` (new `docs/payments.md`): set `PAYMENT_PROVIDER=midtrans` + Sandbox keys in `.env`; pay on the Snap page with the Sandbox simulator; the status page credits via the status check (US-032) without a tunnel; optional notification URL `https://<tunnel>/api/v1/webhooks/payments/midtrans` in the Sandbox dashboard (US-031).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/lib/api/wallet.ts` (+ test) | Real top-up calls |
| MODIFY | `apps/web/src/components/wallet/topup-sheet.tsx` (+ test) | Error codes |
| CREATE | `docs/payments.md` | Sandbox run instructions |

**Testing:** `createTopup` sends the header and body, parses 201, throws typed errors; `fetchTopup` 404 → null; sheet: `REQUEST_IN_PROGRESS` keeps the key, `PAYMENT_GATEWAY_UNAVAILABLE` retry uses a new key.
