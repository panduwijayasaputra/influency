# US-039: Admin Processes Payouts (Simulated)

**Status:** backlog
**Priority:** medium
**Feature:** creator-earnings

## Description

As an admin, I want to review, approve and record payouts, so that creators are paid through a controlled, auditable process.

## Acceptance Criteria

- [ ] Payouts follow the states REQUESTED → IN_REVIEW → APPROVED → PROCESSING → PAID, with REJECTED, ON_HOLD and FAILED
- [ ] A payout can be marked PAID only with an operator-entered transfer reference; no real transfer is performed
- [ ] Every payout action records the admin and timestamp
- [ ] Creators see status changes in their payout history
