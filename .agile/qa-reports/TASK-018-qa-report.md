# QA Report: TASK-018 — Signed-in-only shell and page headers

**Status:** PASS
**Date:** 2026-11-07

## Code Review

### Guidelines Compliance
- [x] The root layout mounts `SignedInChrome` (server) inside the existing `Suspense`. It renders `AppChrome` only for a signed-in user, so guests get no bottom nav and no spacer on any page.
- [x] `IfSignedIn` (server) wraps the post page's `PageHeader` in its own `Suspense`, so guests see no top bar there.
- [x] Build: the Proxy is registered, and the static shell is unchanged. Pages that were static (e.g. `/discover`) are now partial prerenders (◐), because the layout's session read streams.
- [x] `frontend.md` "App shell" now documents: guest pages via `isGuestPath`, new pages login-only by default, `SignedInChrome`/`IfSignedIn`, and guest actions → `loginHref`.

### Security
- [x] What is shown is decided by the real session (`/auth/me` through `getCurrentUser`), not the cookie. An outage counts as a guest.
- [x] Post page actions for guests were already login links (like, comment, unlock, report), and their tests pass unchanged.

### Code Quality
- [x] `getCurrentUser` is React-`cache`d, so the layout, the header and the page share one `/auth/me` call per request.

## Acceptance Criteria Verification
- [x] On post pages a guest sees no top bar and no bottom nav. The creator page is TASK-019.
- [x] Every guest action on the post page goes to `/login` with `returnTo`.

## Tests Run
- New `signed-in-chrome.test.tsx`: user → "Navigasi utama"; guest → `null`; outage → `null`. `IfSignedIn` renders its children for a user and `null` for a guest or an outage.
- Post `page.test.tsx`: the header is held until the session check (no "Kembali" while pending), and the post streams. The existing logged-out unlock, like, comment and report tests pass.
- Web: 51 files / 381 tests green. Typecheck and lint clean. Web build green.
