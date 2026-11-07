# QA Report: TASK-025 — Schema: `user_roles` + minimal `creator_profiles`, shared `/auth/me` contract, seed

**Story:** US-009
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Prisma conventions: uuidv7 PKs, `Timestamptz(3)`, snake_case `@map`/`@@map` (enums `granted_role`, `creator_profile_status`); `schema-conventions.integration.spec.ts` passes
- [x] Migration `20261102193819_roles_and_creator_profiles` generated, not hand-edited; prior migrations untouched
- [x] Shared contract (`ROLES`, `Role`, `meResponseSchema`, `MeResponse`) in `packages/shared/src/auth.ts`
- [x] Seed step idempotent (upsert by fixed ids / compound unique), FK order (after users)

### Security
- [x] `GrantedRole` holds only `ADMIN`; CREATOR is not storable, so it cannot drift from the profile status
- [x] No endpoint writes `user_roles` (seed / manual DB only)
- [x] FKs `ON DELETE RESTRICT`

### Financial Integrity
- N/A (no money)

### Code Quality
- [x] Small, matches the existing seed/spec style

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 2 | USER for all; CREATOR only via approved profile; ADMIN only via DB/seed | PASS (data layer) | Enum has only ADMIN; profile status drives CREATOR (enforced in TASK-026) |
| 1, 3–5 | — | n/a | TASK-026 / TASK-027 |

## Tests Run

- [x] `pnpm --filter @influency/shared test`: 53 passed
- [x] `vitest run prisma/seed src/common` (api): 62 passed
- [x] Typecheck / lint (api, shared): PASS; `pnpm format:check`: PASS (after formatting `roles.ts`)
- [x] `pnpm db:seed` on the local DB: OK
- [x] New tests: `packages/shared/src/auth.test.ts`, `apps/api/src/common/roles-schema.integration.spec.ts`, extended `apps/api/prisma/seed/seed.integration.spec.ts`
- [x] Edge cases: duplicate `(user_id, role)`, second profile per user, duplicate slug, default `PENDING_REVIEW`, unknown role / missing roles rejected by schema, seed run twice

## Issues

None.

## Notes

- Slug is `UNIQUE` but case-sensitive; normalization + `CHECK (slug = lower(slug))` belong to US-010 (risk noted in the plan).
