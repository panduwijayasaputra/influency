# US-045: End-to-End Sandbox Journey

**Status:** backlog
**Priority:** medium
**Feature:** mvp-acceptance

## Description

As a product reviewer, I want automated end-to-end tests of the main user journeys, so that I can trust the MVP works before review.

## Acceptance Criteria

- [ ] A Playwright test covers: open Claudia logged out → login (test adapter) → return to page → top up → balance credited once → unlock a 5 Koin / 7 day post → media loads
- [ ] The test confirms another user cannot open that premium post
- [ ] A second journey covers: subscribe to Claudia for 30 Koin / 30 days → all Claudia premium posts open → Creator B premium posts stay locked
- [ ] The tests verify that a revenue entry exists and no payout was paid automatically
- [ ] The tests run in CI
