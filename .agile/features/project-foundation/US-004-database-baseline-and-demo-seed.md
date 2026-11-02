# US-004: Database Baseline & Demo Seed

**Status:** backlog
**Priority:** high
**Feature:** project-foundation

## Description

As a developer, I want a Prisma schema with migrations and a resettable demo seed, so that everyone works against the same data model and the same demo data.

## Acceptance Criteria

- [ ] Prisma migrations are committed and apply cleanly to an empty database
- [ ] One documented command resets the local database and re-runs the seed
- [ ] Schema conventions are in place: UUID primary keys, UTC timestamps, snake_case table/column names, integer types for Koin and IDR
- [ ] The seed is structured so later stories can add the demo identities from handoff §15.5 (Claudia `claudiandreya`, Creator B `creatorb`, subscribers A/B, admin)
