# US-033: Top-Up Status Page

**Status:** backlog
**Priority:** medium
**Feature:** midtrans-topup

## Description

As a user who just paid, I want to see whether my top-up is pending, successful or failed, so that I know if my Koin have arrived.

## Acceptance Criteria

- [ ] `/wallet/topups/{orderId}` shows the status as known by the server and refreshes while pending
- [ ] Only the order owner can view the order
- [ ] On success the page shows the credited Koin and new balance
- [ ] On failure or expiry it offers to start a new top-up
