# QA Report: TASK-061 — Studio — Arsipkan / Pulihkan and archived state

**Story:** US-047
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] `PostStatusActions` stays a small client component; a status map picks Publikasikan (DRAFT) / Arsipkan (PUBLISHED, outline) / Pulihkan (ARCHIVED); PENDING_REVIEW shows only its notice; REMOVED renders nothing
- [x] Same fetch/error handling as before (same-origin, `credentials: 'include'`, API message in `role="alert"`, `router.refresh()` on success)
- [x] Bahasa copy: "Diarsipkan" label in the post list, archived notice, locked hints "Jenis post / Media tidak bisa diubah setelah post terbit." (matches the new `POST_LOCKED` message)

### Security
- [x] UI only; the API decides every transition. No new data shown

### Financial Integrity
- N/A

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 5 | Studio shows Arsipkan / Pulihkan instead of hide/show; archived state in the list | PASS | Tests: PUBLISHED → "Arsipkan" POSTs `/archive`; ARCHIVED → "Pulihkan" POSTs `/restore` with the archived notice; list label via `POST_STATUS_LABELS.ARCHIVED = 'Diarsipkan'` |
| 4 | (UI side) media can't be removed from an archived post | PASS | Media section `locked` via `isPostEditable` (DRAFT only); post form disables Gratis/Premium for ARCHIVED (new test) |

## Tests Run

- [x] Full `pnpm check`: exit 0. Shared 162, web 150 (26 files), api 396 (34 files)

## Issues (if any)

None.
