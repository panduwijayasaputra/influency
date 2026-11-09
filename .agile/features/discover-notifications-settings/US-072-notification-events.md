# US-072: Notification Events

**Status:** ready_for_uat
**Priority:** high
**Feature:** discover-notifications-settings

## Description

As a logged-in user, I want to be notified when something relevant happens, so that I come back to Influency at the right moment.

## Acceptance Criteria

- [ ] Default (configurable) event list. Subscriber: new post from a followed creator, reply to my comment, like on my comment, top-up success, subscription ending soon (example: 3 days before the period ends). Creator: new subscriber, unlock, tip received, payout status change.
- [ ] Events caused by a financial transaction (top-up, unlock, subscription, tip, payout) are recorded as an outbox row in the **same** DB transaction; the notification is produced after commit. A notification failure never rolls back or blocks the financial transaction.
- [ ] Each event has a deterministic dedupe key (e.g. per top-up order, per subscription period, per comment), so retries, duplicate webhooks and concurrent workers create at most one notification. New-post fan-out to followers is throttled (configurable).
- [ ] No self-notifications (my own comment, my own post). Reply/like notifications on locked premium posts go only to users who can access the post and never include comment text.
- [ ] Integration tests cover each event type, dedupe under duplicate and concurrent triggers, outbox commit/rollback behaviour, and the no-self / no-leak rules.

## Tasks

### TASK-229: Producer service (outbox insert, savepoint, fan-out) + ADR
**Status:** done

### TASK-230: Wire event producers
**Status:** done

### TASK-231: Subscription-ending reminder sweep
**Status:** done
