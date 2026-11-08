# US-031: Credit Koin from Verified Midtrans Notification

**Status:** ready_for_uat
**Priority:** high
**Feature:** koin-wallet

## Description

As a user who paid for Koin, I want my wallet credited exactly once as soon as Midtrans confirms the payment, so that I get what I paid for and never more or less.

## Acceptance Criteria

- [x] `POST /webhooks/payments/midtrans` (no session, CSRF-exempt) stores every notification durably before processing, then verifies `SHA512(order_id + status_code + gross_amount + ServerKey)` (constant-time compare), and checks order exists, gross amount equals the snapshot, currency and merchant match. It returns 200 only after the event is durably stored and handled; a failure to store returns non-2xx so Midtrans retries.
- [x] **Status mapping** to the internal machine (CREATED → PENDING → PAID → CREDITED; EXPIRED, FAILED/DENIED, CANCELED), per current Midtrans docs: `settlement`, and `capture` with `fraud_status=accept`, are success; `pending` stays pending; `deny`, `cancel`, `expire`, `failure` are terminal and credit nothing. Terminal states never move backwards.
- [x] **creditOnce:** a success creates, in one DB transaction, the ledger credit, the Koin lot, the balance update and the order's CREDITED state (with `paid_at`, `credited_at`, provider transaction ID). Duplicate, concurrent (10 at once) and out-of-order (`capture` then `settlement`) notifications credit exactly once.
- [x] A bad signature is rejected with no state change. A valid signature with a mismatched amount, currency or merchant is quarantined for review (flag + stored payload), with no credit.
- [x] Integration tests cover all of the above against real Postgres, including that a browser redirect alone never credits. A manual sandbox check (public HTTPS tunnel + Midtrans simulator) is documented with run instructions.

## Tasks

### TASK-155: Webhook event store, status mapping and creditOnce
**Status:** done

### TASK-156: Midtrans notification endpoint
**Status:** done
