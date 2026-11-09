# US-063: Request Payout (Quote & Atomic Reservation)

**Status:** ready_for_uat
**Priority:** high
**Feature:** creator-studio

## Description

As an approved creator, I want to request a payout that reserves my available earnings right away, so that the same money can never be requested twice.

## Acceptance Criteria

- [ ] `GET /me/payouts/quote?amountIdr=` returns the amount, transfer fee, net amount, destination (bank + last 4) and whether the fee is a placeholder. The fee comes from server config (labelled [TBD] placeholder, integer IDR), never from the client.
- [ ] `POST /me/payouts` with `Idempotency-Key` (same key + same payload → same payout; different payload → reject) creates a `REQUESTED` payout. It snapshots the amount, fee, net and destination account, and reserves the amount in the same transaction under a row lock.
- [ ] Rejects: amount < Rp100.000 (measured before the fee), amount > available, net ≤ 0, no active payout account, not an approved creator. Two simultaneous requests can never reserve more than available (concurrency test).
- [ ] The payout record and its status changes are append-only (status history rows, no edits or deletes). No money moves and nothing is sent to a bank or provider.
- [ ] US-058 uses this API instead of dummy data. Integration tests cover the limits, idempotency, concurrent requests, the snapshot and isolation.

## Tasks

### TASK-214: Transfer fee config + quote endpoint
**Status:** done

### TASK-215: Atomic payout request
**Status:** done
