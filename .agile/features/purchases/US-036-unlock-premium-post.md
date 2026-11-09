# US-036: Unlock Premium Post (Atomic Purchase & Revenue Ledger)

**Status:** ready_for_uat
**Priority:** high
**Feature:** purchases

## Description

As a user, I want to unlock a premium post with Koin and keep access forever, so that I can see content I paid for, even if the creator later archives it.

## Acceptance Criteria

- [x] **Atomic purchase:** `POST /posts/:id/purchase` requires an `Idempotency-Key` and runs in one DB transaction with the wallet row locked. It writes:
  - a debit ledger entry (new debit entry type)
  - FIFO lot spend allocations
  - a purchase record that snapshots the current offer version, the price and `feeBps=2000`
  - a non-expiring entitlement
  - revenue ledger rows (platform + creator), where creator + platform = gross

  A failure leaves nothing behind. The price comes from the DB offer, never from the client.
- [x] **No double charge:**
  - same key + same payload replays the result; same key + different payload is rejected
  - buying an already-purchased post again (any key, concurrent or not) returns the existing entitlement without a debit (DB unique on buyer + post)
  - two simultaneous purchases cannot overspend the wallet
- [x] **Rejections (no debit):**
  - a guest gets 401
  - free, own, unpublished, archived (no new sales), removed, or non-public-creator posts are rejected
  - insufficient balance is rejected with a clear error code

  Split example: a 25-Koin premium post → creator Rp20.000, platform Rp5.000.
- [x] **Access:** the entitlement check (handoff §6.4) returns `full` for an active purchase, using server time. This includes an ARCHIVED post the buyer purchased (private access only: direct link, later the Dibeli list), but not a REMOVED post. Media URLs are minted only after this check.
- [x] The Unlock sheet calls this API, the post re-renders unlocked, and the Dompet activity shows the debit with the post as the related item. Integration tests cover atomicity, idempotency, concurrency, the split arithmetic, archive access and isolation (user A's purchase never unlocks the post for user B).

## Tasks

### TASK-164: Spend core — debit with FIFO lot allocation and revenue ledger
**Status:** done

### TASK-165: Post purchase endpoint
**Status:** done

### TASK-166: Paid access, wallet activity and Unlock wiring
**Status:** done
