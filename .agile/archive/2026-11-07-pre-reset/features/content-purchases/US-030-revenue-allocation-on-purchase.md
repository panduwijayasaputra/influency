# US-030: Revenue Allocation on Purchase

**Status:** backlog
**Priority:** high
**Feature:** content-purchases

## Description

As the Influency finance team, I want each Koin purchase to record the platform commission and the creator's share, so that creator earnings are traceable and correct.

## Acceptance Criteria

- [ ] Every unlock or subscription creates a revenue entry with gross value, platform commission and creator share, in the same transaction as the debit
- [ ] Commission is a configurable rate in basis points (example 20%, not final) and is snapshotted on each purchase
- [ ] Changing the commission rate does not change past revenue entries
- [ ] Top-ups never create creator revenue; revenue is created only when Koin are spent
- [ ] Creator revenue starts in the pending state
