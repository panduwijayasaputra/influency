# US-032: Reconcile Pending Top-Ups

**Status:** ready_for_uat
**Priority:** high
**Feature:** koin-wallet

## Description

As a user whose payment notification was delayed or lost, I want Influency to check Midtrans itself, so that a paid top-up is still credited and an abandoned one is closed.

## Acceptance Criteria

- [x] An in-process reconciler (same pattern as the existing media sweeper) periodically checks orders that are still pending through the Midtrans transaction status API, with backoff, and stops at a configurable max age.
- [x] Viewing a pending order's status page (`GET /wallet/topups/:id`) also triggers a rate-limited status check for that order.
- [x] A successful status is credited through the same `creditOnce` path as notifications, so reconciliation plus a late notification still credits exactly once. Every status response goes through the same verification (order, amount, currency, merchant) and mismatches are quarantined.
- [x] "Not found" before the user picks a payment method keeps the order pending; past the max age the order becomes EXPIRED with no credit. Gateway errors leave the order unchanged and are logged without secrets.
- [x] Integration tests with the fake gateway cover: late success credited, not-found stays pending, expiry, reconcile racing a notification credits once.

## Tasks

### TASK-157: Top-up reconciler and on-demand status check
**Status:** done
