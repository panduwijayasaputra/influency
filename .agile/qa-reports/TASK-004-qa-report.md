# QA Report: TASK-004 — Toast provider, `useToast` and bottom-nav height variable

**Status:** PASS
**Date:** 2026-11-07

## Code Review

### Guidelines Compliance
- [x] Built on Radix `Toast` (already installed). `Toaster` is mounted once in the root layout.
- [x] The `--bottom-nav-height` layout variable lives in `:root`, and `BottomNav` uses it as its height.
- [x] Charcoal `secondary` with white text (AA, covered by `theme.test.ts`).

### Security
- [x] N/A. Messages are plain strings rendered as text.

### Code Quality
- [x] `toast` is memoised. A missing provider throws a clear error. At most 3 toasts (`MAX_TOASTS`), oldest dropped.

## Acceptance Criteria Verification
- [x] Toasts sit above the bottom nav (`calc(var(--bottom-nav-height) + safe-area + 0.75rem)`, `z-60` above sheets).
- [x] They disappear by themselves after `TOAST_DURATION_MS` (4 s).
- [x] They don't overlap: they stack in a flex-column `<ol>`.
- [x] They are announced through a polite `aria-live` region (`type="background"`) and never take focus.

## Tests Run
- `toast.test.tsx`: 5 tests.
  - position + focus
  - polite announcement
  - auto-dismiss with fake timers
  - stacking/cap
  - missing provider
- Web suite green.

## Notes
- On standalone pages without a bottom nav, toasts float 4 rem up. US-003 may zero the variable there.
