# US-064: Payout History & Cancel Request

**Status:** ready_for_uat
**Priority:** medium
**Feature:** creator-studio

## Description

As an approved creator, I want to see my payout requests and cancel one that hasn't been processed, so that I keep control over my money.

## Acceptance Criteria

- [ ] `GET /me/payouts?cursor=` returns my payouts newest first: amount, fee, net, destination (bank + last 4), status (`REQUESTED`, `CANCELED`, and the later admin statuses), requested/updated dates. Only my own payouts.
- [ ] `POST /me/payouts/:id/cancel` (session + CSRF) works only while `REQUESTED`. It appends a `CANCELED` status change and releases the reservation in one transaction, so the amount is available again.
- [ ] Cancelling twice, cancelling a non-REQUESTED payout, or a concurrent double cancel releases the reservation at most once (409 for the loser). Cancelling another creator's payout → 404.
- [ ] US-056 and US-058 use these endpoints instead of dummy data. Integration tests cover listing, cancel, double/concurrent cancel, balance after cancel and isolation.

## Tasks

### TASK-216: Payout list + cancel endpoints, remove the studio dummies
**Status:** done
