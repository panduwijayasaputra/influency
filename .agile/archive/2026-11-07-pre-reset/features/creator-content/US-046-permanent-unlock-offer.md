# US-046: Permanent Unlock Offer (5–1,000 Koin)

**Status:** ready_for_uat
**Priority:** high
**Feature:** creator-content
**Revises:** US-018 (Monetization Spec v1 §2, §4 — LOCKED: individual unlocks never expire; price 5–1,000 Koin)

## Description

As an approved creator, I want to set one Koin price for a premium post that buys permanent access, so that buyers know exactly what they get and my pricing follows platform rules.

## Acceptance Criteria

- [ ] A creator sets a whole-Koin price for a premium post; 4 is rejected, 5 and 1,000 are accepted, 1,001 is rejected (server-side, same rule in the studio form)
- [ ] There is no access-duration input anywhere (studio, API, public feed); offers and the public feed describe access as permanent ("akses permanen")
- [ ] Changing the price still creates a new offer version that applies to future purchases only
- [ ] Existing offers created under US-018 are migrated so no stored offer carries a duration and every stored price is within 5–1,000 (out-of-range demo/seed offers are corrected, not silently kept)
- [ ] A premium post whose current offer is invalid cannot be published

## Tasks

### TASK-058: Permanent offers — shared contract, migration and API
**Status:** done

### TASK-059: Studio offer form and public cards — permanent access copy
**Status:** done
