# QA Report: TASK-011 — `/notifications` placeholder, reserved slug and guidelines

**Status:** PASS
**Date:** 2026-11-07

## Code Review

### Guidelines Compliance
- [x] `/notifications` is a `ComingSoon` placeholder with `PageHeader` "Notifikasi" and Indonesian copy. It keeps the bottom nav (it is not in `STANDALONE_PREFIXES`), and no tab is active on it.
- [x] `notifications` is appended to `RESERVED_SLUGS` in `packages/shared`. The API validates slugs with the same `slugSchema`, so creator applications can no longer claim it.
- [x] `CLAUDE.md` and the `frontend.md` reserved lists include `notifications`. `frontend.md` "App shell" documents that Home is the only page with `HomeTopBar`.

### Security
- [x] No data or access logic.

## Acceptance Criteria Verification
- [x] `notifications` is a reserved slug.
- [x] The bell's target exists and shows a placeholder until the notifications feature is built.

## Tests Run
- `creators.test.ts`: the existing `it.each` now covers `notifications` (shared 204 tests, up from 203).
- `pnpm check` green: shared 204, web 320, api 617. Format, lint and typecheck clean.
- `pnpm --filter @influency/web build`: 23 routes, `/notifications` static.

## Notes
- The manual 320–430 px width check needs a browser and moves to UAT.
