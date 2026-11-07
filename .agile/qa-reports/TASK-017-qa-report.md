# QA Report: TASK-017 — Guest proxy, guest path rule and signed-in-only Home

**Status:** PASS
**Date:** 2026-11-07

## Code Review

### Guidelines Compliance
- [x] `src/proxy.ts` follows the bundled Next 16 Proxy docs: a named `proxy` export, a `config.matcher` constant, and the default Node runtime. The matcher skips `/api/*` (rewritten to the API), `_next/*` and file requests.
- [x] `isGuestPath` reuses the shared `SLUG_PATTERN` and `RESERVED_SLUGS`, so every reserved route (`discover`, `me`, `wallet`, `login`, …) requires login, and only creator-slug shapes are open.
- [x] Home renders only after `getCurrentUser()` succeeds. Otherwise it calls `redirect(loginHref('/'))`. The drawer gets the same user, and `HomeTopBar.account` is now required, so the top bar and drawer can't render for a guest.
- [x] `AccountEntry` and `GuestBurger` are removed (grep clean).

### Security
- [x] The proxy is UX only, as its comment says. All data and mutations go through `/api/v1`, which authorizes server-side. The app has no Server Functions, so the proxy matcher can't silently skip any.
- [x] The redirect target goes through `loginHref` → `safeReturnTo`: same-origin relative paths only, with the query kept.
- [x] Cookie presence only, with a `shortcut:` comment. A server-revoked session still holding a cookie reaches placeholder pages, but Home validates it and redirects to login.
- [x] No redirect loop: `/login` is a guest path, and it treats an API outage as a guest.

### Code Quality
- [x] An uppercase bio link (`/Ana`) stays open, because the slug is lowercased before matching.

## Acceptance Criteria Verification
- [x] A guest on any non-guest page is redirected to `/login` with `returnTo` (Beranda → `/login`, where `/` is the default return target).
- [x] The Home top bar and drawer are never rendered for a guest.
- [x] After login, the existing `returnTo` flow returns to the page.

## Tests Run
- New `guest-paths.test.ts`: 6 open paths and 18 login-only paths, including `/a`, `/login/x`, `/ana/posts`, `/ana/about` and `/ana/posts/1/x`.
- New `proxy.test.ts`:
  - guest `/discover?tab=x` → 307 to `/login?returnTo=%2Fdiscover%3Ftab%3Dx`; guest `/` → `/login`
  - `/ana`, `/ana/posts/p1` and `/login?returnTo=/me` pass
  - the session cookie passes
  - the matcher excludes `/api/v1/…`, `/_next/static/…` and `/favicon.ico`
- `app/page.test.tsx`: a signed-in user gets h1, Cari and the drawer button; guest → `redirect:/login`; outage → `redirect:/login`.
- `home-top-bar.test.tsx`: the account slot is rendered after Notifikasi.
- Web: 50 files / 375 tests green. Typecheck and lint clean.
