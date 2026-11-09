# US-002: Local Infrastructure & Environment Config

**Status:** ready_for_uat
**Priority:** high
**Feature:** project-foundation

## Description

As a developer, I want PostgreSQL and Redis running locally from one command, with documented environment variables, so that I can develop without installing services by hand or handling real secrets.

## Acceptance Criteria

- [ ] Local PostgreSQL setup is documented (native install, no Docker for now) and the documented `DATABASE_URL` format connects to it
- [ ] `.env.example` lists every variable from the handoff (§8.7) with placeholder values only
- [ ] `.env` files are gitignored and no real credential exists anywhere in the repository
- [ ] The apps fail fast with a clear message when a required environment variable is missing
- [ ] `MIDTRANS_IS_PRODUCTION` defaults to `false`

> Note: Redis deferred to Phase 5 (user decision 2026-11-03).

## Tasks

### TASK-006: Environment Example & Local PostgreSQL Setup Docs
**Status:** done

### TASK-007: API Environment Validation (Fail Fast)
**Status:** done
