# US-039: Send Tip

**Status:** ready_for_uat
**Priority:** medium
**Feature:** purchases

## Description

As a paying fan, I want to send a creator a tip in Koin, so that all of it goes to them as thanks.

## Acceptance Criteria

- [x] `POST /creators/:slug/tips` and `POST /posts/:id/tips` require an `Idempotency-Key` and run in one transaction with the wallet locked. They write a debit, FIFO lot allocations, a tip record (creator, optional post, amount) and a creator revenue ledger row of amount × Rp1.000 with platform Rp0 (`feeBps=0`).
- [x] **Eligibility is re-checked at commit time:** the tipper has an active subscription to that creator or at least one valid purchase from them. A post tip also needs a premium post the tipper has full access to. Otherwise 403 and no debit. Self-tips are rejected.
- [x] The amount must be an integer from 1 to 1,000 (0, 1,001 and decimals are rejected). Insufficient balance is rejected. Idempotency rules are as in US-036.
- [x] Tips never create or extend an entitlement or subscription.
- [x] The profile and post responses say whether the viewer may tip, the Kirim Tip sheet calls this API, and Dompet shows the debit. Integration tests cover the bounds, eligibility (subscriber, purchaser, neither, self), the 0% fee and the absence of entitlement side effects.

## Tasks

### TASK-170: Tips schema, endpoints, eligibility and Kirim Tip wiring
**Status:** done
