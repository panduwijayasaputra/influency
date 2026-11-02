# US-024: Simulated Top-Up for Development

**Status:** backlog
**Priority:** high
**Feature:** koin-wallet

## Description

As a developer, I want to credit Koin through a fake payment provider in development and tests, so that wallet and purchase rules can be built and tested before the real gateway.

## Acceptance Criteria

- [ ] A fake top-up provider can complete a top-up order and credit exactly the ordered Koin
- [ ] Each credit records a ledger entry and a Koin lot with its source top-up and IDR cash basis
- [ ] Completing the same top-up twice credits Koin only once
- [ ] The fake provider cannot be enabled when running in production mode
