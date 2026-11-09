# QA Report: TASK-021 — Web LogoutButton component (not mounted yet)

**Story:** US-007
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Client component only because it needs interactivity; shadcn `Button` (ghost); Bahasa Indonesia copy
- [x] Same-origin `fetch('/api/v1/auth/logout', { method: 'POST' })`; no token handling in JS (cookie is HttpOnly)
- [x] Not mounted anywhere (comment points to US-009)

### Security
- [x] No secrets / tokens client-side; browser supplies cookie + `Origin` so the API CSRF guard passes

### Code Quality
- [x] Pending state disables the button (no double submit); error path re-enables it and shows `role="alert"`

**Plan deviation (intentional):** the plan said `window.location.assign('/')`. Next's lint rule `@next/next/no-location-assign-relative-destination` flags it, so the component uses `router.replace('/')` + `router.refresh()`; `refresh()` re-renders server components, so no logged-in RSC state survives — same goal as the full navigation.

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 3 | User can log out (UI side) | PASS | Button calls the revoking endpoint; mounting comes with US-009 |

## Tests Run

- [x] `pnpm check` (format, lint, typecheck, test): PASS — shared 18, web 11, api 128
- [x] New tests: `apps/web/src/components/logout-button.test.tsx`
- [x] Edge cases: double click while pending (one request), 403, 500, network error (alert, button re-enabled, no navigation)

## Issues

None.
