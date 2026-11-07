# US-025: Unlock a Premium Post with Koin

**Status:** backlog
**Priority:** high
**Feature:** content-purchases

## Description

As a logged-in user, I want to spend Koin to unlock a premium post for its access period, so that I can view that post (e.g. 5 Koin for 7 days).

## Acceptance Criteria

- [ ] Before confirming, the user sees the price, duration, estimated expiry and whether an active subscription already covers the post
- [ ] A successful unlock debits exactly the current offer price once and grants access ending at purchase time + duration
- [ ] If the balance is too low, the request fails with `INSUFFICIENT_COINS` (required and available amounts), nothing is debited and no access is granted
- [ ] Repeating the same request (same idempotency key) or two simultaneous requests never charge twice; with balance for only one, exactly one succeeds
- [ ] If the price changed since the page loaded, the user gets `OFFER_CHANGED` and must confirm the new price; if they already have access, `ALREADY_ENTITLED` is returned without a charge
