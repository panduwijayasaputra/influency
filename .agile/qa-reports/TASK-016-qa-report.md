# QA Report: TASK-016 — Login landing layout and signed-in redirect

**Status:** PASS
**Date:** 2026-11-07

## Code Review

### Guidelines Compliance
- [x] `/login` stays standalone (`AppChrome` `STANDALONE_PREFIXES`). Build: `/login` is a partial prerender.
- [x] Layout matches the design: logo, CSS-only hero (`aria-hidden`, token gradients; only the `bg-black/xx text-white` overlay exception), headline and subline as specified, error and in-app notice, Telegram button, consent line with both legal sheets, dev links.
- [x] The Telegram button uses `bg-telegram text-telegram-foreground`. I checked that `cn` (clsx + tailwind-merge) drops the Button's default `bg-primary`.
- [x] The hero height is clamped (`clamp(12rem, 38dvh, 22rem)`) so the button stays reachable on short phones. The page still scrolls.
- [x] `frontend.md` "Auth" documents the redirect and the token's single use.

### Security
- [x] The redirect target always goes through shared `safeReturnTo`, so external URLs, `//`, `/login` and `/api` map to `/`. No open redirect, no loop.
- [x] An API outage is treated as a guest, so visitors stay on the login page. The session is checked through `/auth/me` server-side, not just by cookie presence.
- [x] The Telegram start link still goes through `telegramStartHref(returnTo)` (full navigation, server-validated `returnTo`).

### Code Quality
- [x] The existing `LoginError`, `TelegramStart` and `DevLogin` helpers and their Suspense fallbacks are kept unchanged.

## Acceptance Criteria Verification
- [x] Standalone page with logo, hero, the headline "Lebih dekat dengan creator favoritmu" and the specified subline.
- [x] One primary **Masuk dengan Telegram** button with `returnTo` preserved. The error message, dev links and in-app notice still work (their tests pass).
- [x] Syarat and Kebijakan Privasi open bottom sheets (TASK-015).
- [x] A signed-in user is redirected to `returnTo`, or to `/`.

## Tests Run
- `page.test.tsx`:
  - The landing renders the h1, subline, logo label, Telegram link to `/api/v1/auth/telegram/start`, both legal buttons and the decorative hero.
  - `RedirectIfSignedIn`: guest → `null`; outage → `null`; signed in → `/ana/posts/1`, `/` (no returnTo), `/` (external), `/` (`/login`).
- Existing `LoginErrorMessage`, `InAppBrowserNotice` and `DevLoginLinks` tests pass.
- `pnpm check` green: shared 207, web 346, api 623. Web build: 24 routes.

## Notes
- A signed-in visitor may briefly see the page before the streamed redirect, the same as the studio and admin gates (accepted in the plan).
- Manual UAT (no browser here): 320×568 / 375 / 390 / 430 px fit, sheet scroll and swipe-close, and `/login?returnTo=/discover` while signed in → `/discover`.
