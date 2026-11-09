# QA Report: TASK-060 — Archive & restore — shared contract, migration and API

**Story:** US-047
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Hand-written migration: `ALTER TYPE post_status RENAME VALUE 'HIDDEN' TO 'ARCHIVED'`, `post_archive_episodes` (uuidv7 PK, Timestamptz(3), snake_case, FK RESTRICT), partial unique index `post_archive_episodes_one_open`, CHECK `restored_at >= archived_at`, backfill of open episodes for legacy HIDDEN posts. `prisma migrate diff` against the schema is empty (no drift); schema-conventions spec passes with no exemption needed
- [x] Thin controller (`:id/archive`, `:id/restore`); service transitions run in one transaction under `lockPost` (SELECT … FOR UPDATE)
- [x] `POST_EDITABLE_STATUSES = ['DRAFT']`; media and visibility code paths pick it up via `isPostEditable` without changes

### Security / isolation
- [x] Both endpoints are owner-scoped through `lockPost` (foreign/unknown → 404, bad uuid → 400, non-creator 403, logged out 401, foreign Origin 403), covered by the owner-scope test

### Financial Integrity
- N/A (no money moves). Episodes are append-only apart from the single `restored_at` close. Concurrent archives are serialized by the row lock and the DB index guarantees one open episode

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Archive own published post; leaves public feed; no new unlocks | PASS | PUBLISHED → ARCHIVED; feed test drops it; DRAFT/REMOVED/PENDING_REVIEW → 409. Unlocks: US-025 must require PUBLISHED (noted for codebase map) |
| 2 | Episode per archive, closed on restore, fresh one on re-archive, never edited | PASS | Test checks open → closed (`restoredAt >= archivedAt`) → re-archive leaves the closed row byte-identical and opens a new one; direct second open insert fails |
| 3 | Restore returns to public page as PUBLISHED | PASS | Status PUBLISHED, `publishedAt` unchanged, back in the feed |
| 4 | Archiving never deletes post or media | PASS | Post row still exists; media DELETE / new slot / visibility change → 409 `POST_LOCKED` while archived; caption and offer price still editable |
| 6 | Archived visible only to owner | PASS | Excluded from the public feed; studio is owner-scoped |

## Issues found and fixed during QA

- `restore` set `restored_at` from the app clock while `archived_at` uses the DB default; clock skew could trip the CHECK and 500. Fixed: closes the episode with `UPDATE … SET restored_at = now()` (DB clock).

## Tests Run

- [x] shared: typecheck, lint, 162 tests pass
- [x] api: typecheck, lint, 396 tests pass (34 files). One run hit `auth.integration.spec.ts > replayed state` once; it passed on 3 re-runs and is unrelated (flaky timing in an untouched file)
- [x] Prettier check clean
- Web is not checked here: `labels.ts` still has `HIDDEN` until TASK-061
