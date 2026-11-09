# US-060: Earnings Balance API

**Status:** ready_for_uat
**Priority:** high
**Feature:** creator-studio

## Description

As an approved creator, I want my pending, available and reserved earnings calculated by the server, so that the numbers I see are correct and match the ledger.

## Acceptance Criteria

- [ ] `GET /me/earnings` (approved creator only; others 403, guests 401) returns integer IDR `pendingIdr`, `availableIdr`, `reservedIdr`, `paidOutIdr`, `nextMaturityAt` and `nextMaturityIdr`, only for the caller's own creator profile.
- [ ] Computed from my `CREATOR` revenue ledger rows (sales and reversals): a row is pending until `accruesAt + 14 days` and available after, using server time. A scheduled subscription period matures 14 days after its start; a cancelled scheduled period never becomes available.
- [ ] `availableIdr` = matured − reserved (requested payouts) − paid out. It is never negative; a negative result is reported as an error log, not hidden. The 14-day period is one shared constant (LOCKED).
- [ ] No float math anywhere (BigInt/integer columns). The response contains no other creator's data and no buyer details.
- [ ] US-056 uses this endpoint instead of the dummy balance. Integration tests use a controlled clock to cover pending→available at the exact boundary, scheduled periods, reversals, reservations and creator isolation.

## Tasks

### TASK-209: Payouts data model (accounts, payouts, status history)
**Status:** done

### TASK-210: `GET /me/earnings` balance
**Status:** done
