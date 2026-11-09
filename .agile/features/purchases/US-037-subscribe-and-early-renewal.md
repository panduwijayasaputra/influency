# US-037: Subscribe & Early Renewal

**Status:** ready_for_uat
**Priority:** high
**Feature:** purchases

## Description

As a fan, I want to subscribe to a creator for 30 days and optionally prepay the next period early, so that I can see all their premium posts without interruption and without automatic charges.

## Acceptance Criteria

- [x] **Subscribe:** `POST /creators/:slug/subscribe` requires an `Idempotency-Key` and runs in one transaction with the wallet locked. It writes:
  - a debit and FIFO lot allocations
  - a period `[startsAt, startsAt + 30×24h)` in UTC that snapshots the plan version, price, `feeBps=1500` and creator
  - revenue ledger rows (example: 75 Koin → platform Rp11.250, creator Rp63.750)

  With no active period, the new period starts now.
- [x] **Early renewal:** while a period is active, the same call creates one SCHEDULED period starting exactly at the current `endsAt` (no overlap, no gap). A second scheduled period is rejected, including under simultaneous requests (row lock or unique constraint). No auto-renewal or auto-debit ever happens.
- [x] **Rejections (no debit):** a guest gets 401; the creator's own profile, a creator without an active plan, and a non-public creator are rejected; so is an insufficient balance. Idempotency rules are as in US-036. The price comes from the DB plan, and a plan price change after purchase does not change a paid or scheduled period.
- [x] **Access:** an active period (judged by its timestamps and server time, not a cached status) gives `full` access to all that creator's published premium posts, including ones published later. Archived posts follow spec §4.1:
  - only a period active at `archivedAt` keeps access, until that period's `endsAt`
  - scheduled renewals and later periods do not inherit it
  - republishing restores normal subscriber access
- [x] The Langganan sheet calls this API, the profile shows "Berlangganan · x hari lagi", and Dompet shows the debit. Integration tests cover the period boundaries, the scheduled-renewal race, the archive cases from spec §15, and isolation between users and between creators.

## Tasks

### TASK-167: Subscription periods schema and subscribe endpoint
**Status:** done

### TASK-168: Subscription access, archive grants and Langganan wiring
**Status:** done
