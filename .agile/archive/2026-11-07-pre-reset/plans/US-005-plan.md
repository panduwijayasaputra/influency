# Technical Plan: US-005 — Continuous Integration Pipeline

## Architecture Overview

One GitHub Actions workflow (`.github/workflows/ci.yml`), one job, that runs the existing root `pnpm check` (format:check → lint → typecheck → test, chained with `&&`) against a `postgres:18` service container. No new scripts. CI reuses exactly what developers run locally.

Agreed decisions (2026-11-03):
- **Triggers:** `push` to `main` + every `pull_request`. This reads AC "each push" as pushes to the default branch, since feature-branch work is checked through its PR. It avoids duplicate push+PR runs.
- **Action pinning:** full 40-char commit SHA with a `# vX.Y.Z` comment. Each version must be published at least two weeks ago, matching the repo's exact-pin rule.
- **pnpm:** `pnpm/action-setup` reads the version from `packageManager`. `actions/setup-node` caches the pnpm store, keyed on `pnpm-lock.yaml`.

Out of scope: Playwright (no e2e suite yet; it gets added to this workflow by the story that introduces it), Redis (Phase 5), split jobs/matrix, deploy.

## Dependencies

- None in the repo (no npm packages).
- GitHub Actions: `actions/checkout`, `pnpm/action-setup`, `actions/setup-node`, all SHA-pinned.
- Service image `postgres:18`.

## Risks

- **Test DB guard:** `apps/api/test/global-setup.ts` requires `TEST_DATABASE_URL` to name a `*_test` DB different from `DATABASE_URL`. Mitigation: set both in job env with different DB names (`influency_test` / `influency`). `DATABASE_URL` is never contacted, because `vitest.config.ts` overrides it with the test URL.
- **No `.env` in CI:** `vitest.config.ts` and `prisma.config.ts` load the root `.env` only if it exists. Real env vars are used otherwise. `DATABASE_URL` is the only required var in `envSchema`, so the job env is enough. Don't create a `.env` in CI.
- **Prisma engines:** `allowBuilds` disables `@prisma/engines` postinstall. `prisma migrate deploy` (run by global-setup) downloads the schema engine on first use, which needs runner network access (available by default).
- **pnpm/action-setup `version` input:** don't pass it. The action errors if it conflicts with `packageManager`.
- **Can't be fully verified locally:** proof of green/red runs needs a push to GitHub. The dev agent must not push. The user pushes and confirms (see Testing).

## Tasks

### TASK-014: GitHub Actions CI workflow with PostgreSQL service

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    services:
      postgres:
        image: postgres:18
        env:
          POSTGRES_USER: influency
          POSTGRES_PASSWORD: postgres # throwaway CI-only DB, not a secret
          POSTGRES_DB: influency_test
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U influency -d influency_test"
          --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      # Placeholder config only; CI never uses real secrets.
      NODE_ENV: test
      DATABASE_URL: postgresql://influency:postgres@localhost:5432/influency
      TEST_DATABASE_URL: postgresql://influency:postgres@localhost:5432/influency_test
      MIDTRANS_IS_PRODUCTION: 'false'
    steps:
      - uses: actions/checkout@<sha> # vX.Y.Z
      - uses: pnpm/action-setup@<sha> # vX.Y.Z  (no `version:` — reads packageManager)
      - uses: actions/setup-node@<sha> # vX.Y.Z
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm check
```

Implementation notes:
- Resolve each action's latest release at least two weeks old, and get its commit SHA: `gh api repos/<owner>/<repo>/releases` for the tag and date, then `gh api repos/<owner>/<repo>/commits/<tag> --jq .sha`. If an annotated tag resolves to a tag object, use the commit SHA. Put the version in a trailing comment.
- If `NODE_ENV: test` breaks anything, keep it anyway: `envSchema` accepts `test`. Check that no test asserts the `development` default. If one does, drop the line rather than change the test.
- Don't reference `secrets.*` or `vars.*` anywhere.
- Keep `pnpm check` as the single test step: it already builds `@influency/shared` before tests and fails on the first failing check.

Update `README.md`: add a short "CI" section saying what runs (`pnpm check` on push to `main` and on PRs, against Postgres 18), that it uses no secrets, and that `pnpm check` locally reproduces it.

Update `.agile/guidelines/codebase-map.md`: add `.github/workflows/ci.yml` to the tree, change "No product features or CI yet" so it no longer claims CI is missing, and mark US-005 in the feature backlog table.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `.github/workflows/ci.yml` | CI workflow: Postgres 18 service, install, `pnpm check` |
| MODIFY | `README.md` | CI section |
| MODIFY | `.agile/guidelines/codebase-map.md` | Record CI in tree/current state |

**Testing:**
- Local dry run, with the same env as CI: `TEST_DATABASE_URL=… DATABASE_URL=… pnpm check` against local Postgres. It must pass. Prettier must also accept the new YAML (`pnpm format:check` covers `.github/`; check `.prettierignore` doesn't exclude it).
- Static review: the workflow has no `secrets.`/`vars.` references, every `uses:` is pinned to a 40-hex SHA with a version comment, `permissions` is `contents: read`, and there's no `version:` input on pnpm/action-setup.
- Remote verification (done by the user, since agents don't push): push a branch and open a PR, and the `CI / check` job should be green. Then push a throwaway commit with a deliberate lint error or failing assertion, and the job should be red. Revert it. Record the run links in the QA report if available.

---

## Acceptance Criteria Mapping

| Criterion | Covered by |
|-----------|-----------|
| Workflow runs lint, typecheck and tests on each push and PR | TASK-014 (`on: push [main] + pull_request`, `pnpm check`) |
| Integration tests run against a real PostgreSQL service | TASK-014 (`postgres:18` service, `TEST_DATABASE_URL`) |
| Workflow fails when any check fails | TASK-014 (`pnpm check` `&&` chain; red-run verification) |
| No real secrets; placeholder/fake config | TASK-014 (inline placeholder env, no `secrets.*`) |
