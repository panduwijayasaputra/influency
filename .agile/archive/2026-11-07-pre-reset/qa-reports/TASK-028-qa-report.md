# QA Report: TASK-028 — Shared slug rules, application schemas and error codes

**Story:** US-010
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Contracts live in `packages/shared` (`creators.ts`), exported from `index.ts`, ESM `.js` import
- [x] Reserved list kept in shared as frontend.md requires; adds `become-creator` (new top-level route) with a comment to keep it in sync
- [x] New error codes in `ERRORS` with HTTP status + Bahasa message

### Security
- [x] Slug whitelist `^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$` after trim + lowercase; no dots, so no file-like slugs
- [x] Reserved names checked after normalization (`ADMIN`, `Become-Creator` rejected)
- [x] Agreement acceptance must be literally `true`

### Financial Integrity
- N/A

### Code Quality
- [x] Small, no duplication; agreement version is a labeled placeholder (TBD legal text)

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Collects display name, slug, bio/category, agreement | PASS (schema) | `creatorApplicationSchema` |
| 2 | Lowercase normalization, permitted chars | PASS (schema) | DB uniqueness in TASK-029/030 |
| 3 | Reserved names rejected with a clear message | PASS | "Alamat ini dipakai oleh sistem. Pilih alamat lain." |
| 4 | PENDING_REVIEW, no second application | — | TASK-030 |

## Tests Run

- [x] `pnpm --filter @influency/shared test`: 94 passed (new `creators.test.ts`: normalization, accepted/rejected slugs, every reserved name incl. uppercase, application schema failures)
- [x] shared typecheck, lint, prettier, build: pass
