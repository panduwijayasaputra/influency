# US-004: Database Baseline & Demo Seed

**Status:** ready_for_uat
**Priority:** high
**Feature:** project-foundation

## Description

As a developer, I want a Prisma schema with migrations and a resettable demo seed, so that everyone works against the same data model and the same demo data.

## Acceptance Criteria

- [x] Prisma migrations are committed and apply cleanly to an empty database
- [x] One documented command resets the local database and re-runs the seed
- [x] Schema conventions are in place: UUID primary keys, UTC timestamps, snake_case table/column names, integer types for Koin and IDR
- [x] The seed is structured so later stories can add the demo identities from handoff §15.5 (Claudia `claudiandreya`, Creator B `creatorb`, subscribers A/B, admin)

## Tasks

### TASK-011: Schema conventions + `users` baseline migration
**Status:** done

### TASK-012: Real-Postgres test harness + schema-convention integration test
**Status:** done

### TASK-013: Resettable demo seed + `db:reset` command
**Status:** done
