# US-030: Create Top-Up Order (Midtrans Snap Sandbox)

**Status:** ready_for_uat
**Priority:** high
**Feature:** koin-wallet

## Description

As a signed-in user, I want to pay for a Koin package through Midtrans checkout, so that I can buy Koin with my usual payment method.

## Acceptance Criteria

- [x] `POST /wallet/topups` takes only a package ID. The server loads Koin and price from the DB (any client amount is ignored), creates a top-up order with a unique order number (used as Midtrans `order_id`) and an immutable snapshot (Koin, gross IDR, fee 0, currency IDR, user, package version), then creates a Snap Sandbox transaction and returns the Snap token / redirect URL and the order ID.
- [x] **Idempotency:** an `Idempotency-Key` header is required. Same key + same payload returns the same order and token; same key + different payload is rejected with a domain error. Rapid repeated taps never create two orders.
- [x] **Gateway boundary:** Midtrans sits behind a payment-gateway interface. The Server Key stays in the API (only the client key may reach the browser); config validation refuses to start with `MIDTRANS_IS_PRODUCTION=true`. A fake gateway is used in automated tests and can be enabled for local dev, never in production.
- [x] If Snap creation fails, the order is marked failed and the user gets an Indonesian error; no Koin move. `GET /wallet/topups/:id` returns status, Koin and (once credited) the new balance, to the order owner only (others get 404).
- [x] The US-028 checkout adapter is replaced: confirming opens Snap (sandbox Snap JS with the client key, or redirect), and Snap's finish/close/error callbacks only navigate to the status page. Integration tests cover price from DB, idempotency, owner-only status and Snap failure.

## Tasks

### TASK-152: Top-up order schema, idempotency keys and payment gateway
**Status:** done

### TASK-153: Create top-up and order status endpoints
**Status:** done

### TASK-154: Wire checkout and status page to the top-up API
**Status:** done
