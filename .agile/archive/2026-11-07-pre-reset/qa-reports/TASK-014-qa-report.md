# QA Report: TASK-014 — GitHub Actions CI workflow with PostgreSQL service

**Story:** US-005 — Continuous Integration Pipeline
**Date:** 2026-11-03
**Verdict:** PASS (remote run pending user push)

## Files Reviewed

| File | Change |
|------|--------|
| `.github/workflows/ci.yml` | New workflow |
| `README.md` | CI section |
| `.agile/guidelines/codebase-map.md` | CI recorded |

## Acceptance Criteria

| Criterion | Result | Evidence |
|-----------|--------|----------|
| Lint, typecheck, tests on each push and PR | PASS | `on: push [main]` + `pull_request`; single step `pnpm check` (format:check && lint && typecheck && test) |
| Integration tests against real PostgreSQL | PASS | `postgres:18` service with `pg_isready` health check; `TEST_DATABASE_URL` → `influency_test`, different from `DATABASE_URL` (`influency`), so `global-setup.ts` guard passes |
| Workflow fails when any check fails | PASS | `pnpm check` is an `&&` chain; probe: misformatted file → `pnpm format:check` exit 1 (probe removed). Red run on GitHub still to be confirmed by user |
| No real secrets | PASS | No `${{ secrets.* }}` / `${{ vars.* }}`; DB password is a throwaway CI-only value; `MIDTRANS_IS_PRODUCTION: 'false'` |

## Checks Run

- `pnpm check` locally: format, lint, typecheck, tests all green (api 49, shared 18, web 1).
- `prettier --check .github README.md`: clean.
- All 3 `uses:` pinned to 40-hex commit SHAs, versions verified at least 2 weeks old via GitHub releases API:
  - `actions/checkout` v7.0.1 (2026-07-20) `3d3c42e5…`
  - `pnpm/action-setup` v6.1.0 (2026-09-05), annotated tag dereferenced to commit `ea17c68d…`
  - `actions/setup-node` v7.1.0 (2026-10-08) `949feb24…`
- `pnpm/action-setup` has no `version` input (reads `packageManager`). `permissions: contents: read`.

## Notes / Not Verified

- The workflow hasn't run on GitHub yet: agents don't push. The user should push, check green, then push a deliberate failure and check red.
- `prisma migrate deploy` downloads the schema engine on first use (`@prisma/engines` postinstall is disabled), which needs runner network access (default).
- `concurrency` also cancels an in-progress `main` run when a newer `main` push arrives. This is acceptable, since the newest commit is what's checked.
