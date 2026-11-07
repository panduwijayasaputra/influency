# QA Report: TASK-013 — Resettable demo seed + `db:reset` command

**Story:** US-004
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] `prisma/seed/`: `index.ts` (entry, loads root `.env`, refuses `NODE_ENV=production`), `seed.ts` (`seedSteps` + `seed()`), `demo-ids.ts` (`DEMO_USER_IDS`), `users.ts` (upsert by fixed id)
- [x] `prisma.config.ts` `migrations.seed: 'tsx prisma/seed/index.ts'`. The key was checked against the `@prisma/config` 7.10.1 types (`seed?: string`, "run after schema migrations are applied")
- [x] `tsx` 4.23.15 pinned exactly (published 2026-09-20, ≥ 2 weeks old); no new `allowBuilds` entry needed
- [x] Scripts: api `db:seed`, `db:reset` (`prisma migrate reset --force && prisma db seed`); root `db:reset`, `db:seed`, `db:migrate`
- [x] README "Database" section, CLAUDE.md commands + gotcha, backend.md seed/convention lines, codebase-map updated

### Security
- [x] No credentials in seed; prod guard; seed output prints step names only

### Financial Integrity
- N/A (no money data seeded yet; example coin packages arrive with US-023/US-044)

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 2 | One documented command resets the local DB and re-runs the seed | PASS | `pnpm db:reset` on `influency` → reset, `init_users` applied, `seeded: demo users`, 5 users. Run with the user's explicit consent (Prisma's AI-agent guard) |
| 4 | Seed structured for §15.5 demo identities | PASS | 5 demo users with fixed ids; later stories append steps to `seedSteps` |

## Tests Run
- [x] New `prisma/seed/seed.integration.spec.ts`: seeds twice → exactly the 5 demo users, expected names, `ACTIVE`
- [x] Manual `pnpm db:seed` twice on dev DB → 5 rows, no duplicates
- [x] `pnpm check` → PASS (shared 18, web 1, api 49 tests; lint, typecheck, format)
