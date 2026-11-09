# QA Report: TASK-005 — Move `purchase-sheet` onto BottomSheet

**Status:** PASS
**Date:** 2026-11-07

## Code Review

### Guidelines Compliance
- [x] Props and exports are unchanged, so callers (`post-grid`, `subscribe-card`) are untouched. The hand-written Dialog markup is gone.

### Security
- [x] No change. The client still decides no price. Buying is still a demo with no request.

### Financial Integrity
- [x] N/A. The `shortcut:` comment still points to US-025/US-027 for the real purchase with an Idempotency-Key.

## Acceptance Criteria Verification
- [x] The existing `purchase-sheet` uses the shared sheet. The demo buy closes the sheet and shows a toast.

## Tests Run
- `creator-posts.test.tsx` updated.
  - Same dialog name, eyebrow, rows and link.
  - Buying closes the dialog and shows the toast.
  - The short-balance case is unchanged.
- The creator `page.test.tsx` now renders inside `Toaster`.
- Web suite green.
