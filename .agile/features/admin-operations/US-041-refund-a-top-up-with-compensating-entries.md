# US-041: Refund a Top-Up with Compensating Entries

**Status:** backlog
**Priority:** medium
**Feature:** admin-operations

## Description

As an admin, I want to record a verified refund without erasing history, so that balances and creator earnings stay correct after a refund.

## Acceptance Criteria

- [ ] A refund adds compensating ledger entries; original entries are never edited or deleted
- [ ] Refunding an unspent top-up removes the matching Koin from the wallet
- [ ] If the refunded Koin were already spent, the account is put on hold and the balance never silently goes negative
- [ ] Affected pending creator earnings are reversed and available earnings are put on hold
- [ ] Each refund records the admin, reason and link to the original top-up
