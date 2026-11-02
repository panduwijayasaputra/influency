# US-034: Reconcile Pending Top-Ups

**Status:** backlog
**Priority:** high
**Feature:** midtrans-topup

## Description

As the Influency finance team, I want pending top-ups to be checked against Midtrans automatically, so that payments are not lost when a notification is late or missing.

## Acceptance Criteria

- [ ] A background job checks pending orders with the Midtrans status API using backoff
- [ ] Reconciliation credits through the same exactly-once path as notifications
- [ ] Orders not yet found at Midtrans stay pending and are retried until they expire
- [ ] Admins can trigger reconciliation for a single order and see the recorded result
