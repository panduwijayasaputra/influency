# QA Report: TASK-005 — Root Scripts, README & Full Verification

**Story:** US-001
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Root scripts fan out with `pnpm -r` (no Turborepo), as agreed
- [x] `test` and `dev` build `@influency/shared` first, because apps load it from `dist/` at runtime
- [x] `check` = `format:check` + `lint` + `typecheck` + `test`, ready for CI in US-005
- [x] CLAUDE.md, tech-stack.md (pinned versions) and README updated with real commands

### Security
- [x] `git status` shows no `node_modules`, `dist`, `.next`, `*.tsbuildinfo`, `next-env.d.ts` or `.env` files would be tracked

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Fresh clone runs `pnpm install` with Node from `.nvmrc` | PASS | All `node_modules`/build output deleted, then `pnpm install` succeeded (pnpm 12.14.0, Node 24.18.1) |
| 2 | Workspace has web, api, shared; web and api start locally | PASS | `pnpm dev`: web `GET /` → 200, api `GET /api/v1/x` → 404 JSON |
| 3 | Root `lint`, `typecheck`, `test`, `format` pass | PASS | `pnpm check` exit 0 after clean install |
| 4 | TypeScript `strict` in every package | PASS | shared/api/web extend `@influency/config` bases with `strict: true` |
| 5 | README explains install, run, test | PASS | Prerequisites, Windows Corepack fallback, scripts table, single-package/test commands, layout |

## Tests Run

- [x] Clean `pnpm install`: PASS
- [x] `pnpm check`: PASS: shared 2, api 2, web 1 tests
- [x] `pnpm build`: PASS (shared → api, web)
- [x] README single-test commands: `vitest run src/app.spec.ts` (2 passed), `-t "boots on Fastify"` (1 passed, 1 skipped)
- [x] `pnpm dev`: both apps reachable

## Issues (resolved during QA)

- `README.md` failed `prettier --check` (table alignment). Fixed with `prettier --write`; the re-run passed.

## Notes

- `CLAUDE.md` and `.agile/` are excluded from Prettier so agent/planning docs aren't reformatted.
