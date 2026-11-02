# US-032: Credit Koin from Verified Payment Notification

**Status:** backlog
**Priority:** high
**Feature:** midtrans-topup

## Description

As a user who paid, I want my Koin to arrive once my payment is confirmed, so that I get exactly what I paid for, even if I closed the browser.

## Acceptance Criteria

- [ ] Notifications are stored durably, then verified by signature, order, amount, currency and merchant before any credit
- [ ] A successful payment credits the ordered Koin exactly once, even if the notification arrives 10 times, concurrently, or as `capture` followed by `settlement`
- [ ] Pending, failed, denied, expired and cancelled payments credit nothing and update the order status
- [ ] A spoofed signature is rejected; a valid signature with the wrong amount is quarantined for review without credit
- [ ] A browser "success" redirect alone never credits Koin
