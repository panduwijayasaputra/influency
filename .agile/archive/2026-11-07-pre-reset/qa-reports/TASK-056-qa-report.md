# QA Report: TASK-056 — Studio publish / hide controls and live-post locks

**Story:** US-019
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] `PostStatusActions` is a small client component; the page stays a server component
- [x] Same fetch / error-shape handling as `post-offer-form.tsx` (`errorResponseSchema`, `credentials: 'include'`, button disabled while pending)
- [x] Bahasa copy; status notices are text, not color

### Security
- [x] UI locks are UX only: the API enforces `POST_LOCKED` / `POST_STATUS_CONFLICT` (TASK-054)
- [x] No secrets or decisions client-side; same-origin POST, so the browser sends `Origin` for the CSRF guard

### Financial Integrity
- N/A

### Code Quality
- [x] `PostMedia` `locked` prop is optional (default false), so existing callers and tests are unchanged; the page passes it explicitly
- [x] Visibility locked through a disabled `<fieldset>`; the current value is still sent and the API accepts it unchanged

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Publishing moves a post to PUBLISHED / PENDING_REVIEW | PASS | "Publikasikan" on DRAFT/HIDDEN → `POST …/publish`, page refresh shows the new status |
| 2 | Premium cannot publish without an offer | PASS | API message (`OFFER_REQUIRED`) shown in an alert |
| 4 | Creator can hide a published post | PASS | "Sembunyikan" on PUBLISHED / PENDING_REVIEW → `POST …/hide` |

## Tests Run

- [x] `pnpm check`: PASS (shared 164, web 140, api 394)
- [x] New tests: `post-status-actions.test.tsx` (5); added cases in `post-form.test.tsx` (live post: radios disabled, caption saves with unchanged visibility) and `post-media.test.tsx` (locked: no file input, no Hapus, hint)
- [x] Edge cases: REMOVED → no buttons; PENDING_REVIEW notice; refused publish doesn't refresh

## Issues (if any)

None.

## Notes

- Page-level wiring (`locked={!isPostEditable(post.status)}`, actions under the status line) is covered by typecheck plus manual UAT; the page has no test harness.
