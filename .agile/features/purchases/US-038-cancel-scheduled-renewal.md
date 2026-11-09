# US-038: Cancel Scheduled Renewal

**Status:** ready_for_uat
**Priority:** medium
**Feature:** purchases

## Description

As a subscriber who prepaid an early renewal, I want to cancel it before it starts and get all its Koin back, so that I am not locked into a period I no longer want.

## Acceptance Criteria

- [x] `POST /subscription-periods/:id/cancel-scheduled` cancels the caller's own SCHEDULED period, only while server time is before `startsAt`. In one transaction it:
  - cancels the period
  - posts a compensating credit of 100% of its Koin (a new credit entry type, linked to the period)
  - restores the lot allocations to their lots
  - posts compensating revenue ledger rows that reverse the creator/platform split

  The current active period is unchanged.
- [x] **Exactly once:** repeated or concurrent cancels return the Koin once. A cancel at or after `startsAt` is rejected. Cancel and activation at the boundary are serialized, so the period ends up either cancelled and refunded or started, never both.
- [x] Another user's period → 404; a period that is not scheduled → rejected. Nothing in any ledger is ever edited or deleted.
- [x] The Langganan sheet's "Batalkan perpanjangan" calls this API (after a confirm step) and shows the returned Koin; Dompet shows the credit. Integration tests cover the boundary, the race and the reversal arithmetic.

## Tasks

### TASK-169: Cancel scheduled renewal with full Koin return
**Status:** done
