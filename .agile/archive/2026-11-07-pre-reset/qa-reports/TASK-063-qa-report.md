# QA Report: TASK-063 — PostAccessService in EntitlementsModule + integration test

**Story:** US-020
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] New feature module `entitlements` (handoff §4 name), provides + exports `PostAccessService`, registered in `AppModule`
- [x] `PostAccessService.check(postId, userId | null)` runs the post query and the ADMIN `user_roles` lookup (same as `AdminGuard`) in parallel
- [x] `creatorPublic` is derived from `PUBLIC_CREATOR`, so the check and the public feed can't drift apart
- [x] Integration spec uses its own id range `…000023xxxx` (free), `createTestPrisma` + `profileFields`, cleans up in `afterAll`

### Security
- [x] Unknown post → `hidden` (same as not visible)
- [x] Role and ownership read from the DB on every call
- [ ] Malformed `postId` would make Prisma throw (500). Accepted: callers must validate with `ParseUUIDPipe` (per the plan); no caller exists yet

### Financial Integrity
- N/A

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1–3 | Access rules end to end against Postgres | PASS | Unknown, free/premium (anonymous + stranger), draft/archived (owner vs anonymous), removed (owner vs admin), suspended creator |
| 4 | Server-side, no client flags | PASS | Only `postId` + session user id in |

## Tests Run

- [x] `vitest run src/modules/entitlements`: 22 passed (2 files)
- [x] Full `pnpm check`: exit 0. Shared 162, web 150 (26 files), api 418 (36 files)

## Issues (if any)

None blocking. Note for US-014/US-021: validate the post id, and pass `req.authSession?.userId ?? null` (needs an optional-session guard on public routes).
