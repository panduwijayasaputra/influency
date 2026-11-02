# US-031: Top Up Koin via Midtrans Snap Sandbox

**Status:** backlog
**Priority:** high
**Feature:** midtrans-topup

## Description

As a logged-in user, I want to buy a Koin package through Midtrans checkout, so that I can get Koin with the payment method I prefer.

## Acceptance Criteria

- [ ] Choosing a package creates a pending top-up order using the package price from the database, never an amount from the browser
- [ ] The order snapshot (Koin, IDR, package version) cannot change after creation
- [ ] The user is shown Midtrans Snap checkout; the Midtrans Server Key never leaves the backend
- [ ] Repeated taps (same idempotency key) do not create duplicate orders
- [ ] The integration runs only against Midtrans Sandbox
