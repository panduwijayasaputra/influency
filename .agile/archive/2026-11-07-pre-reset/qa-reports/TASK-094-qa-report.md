# QA Report: TASK-094 — 44 px tap targets, dvh/safe-area and feed width

**Story:** US-053 Light Social Design Tokens
**Date:** 2026-11-04
**Verdict:** PASS

## Scope reviewed

- `components/ui/button.tsx`: every size is at least 44 px (`default`/`sm`/`xs` → `h-11`, `lg` → `h-12`, `icon`/`icon-sm`/`icon-xs` → `size-11`, `icon-lg` → `size-12`). Variant names are unchanged, so no call site changes. `components/ui/input.tsx` → `h-11`.
- Custom controls bumped to 44 px: Koin balance pill, share button, social chips, post-grid filter tabs, account-menu avatar, header logo link.
- Standalone links found under 44 px during the browser check and fixed with `min-h-11`: post page "← creator" back link, guest like link, guest "Laporkan" link, "Masuk untuk berkomentar".
- `app/layout.tsx`: `min-h-dvh` body (replaces `h-full`/`min-h-full`), `env(safe-area-inset-top/left/right)` padding, `viewportFit: 'cover'`. The bottom inset is already handled by `bottom-nav.tsx` and `purchase-sheet.tsx`.
- Feed width `max-w-feed` (`--feed-max-width: 34rem` = 544 px) on the creator page, the post page, the purchase sheet and the bottom-nav row. Admin, studio and auth pages keep their own form widths.
- `components/ui/button.test.tsx` (new).

## Verification

- `pnpm check`: green (shared 202, web 252, api 617).
- `button.test.tsx`: 9 cases. Every size has `h-11/12` or `size-11/12`, and icon sizes are square.
- **Manual QA checklist**, run with headless Chrome over the DevTools Protocol against `pnpm dev` with seed data (script kept outside the repo). For each page and width it compared `scrollWidth` with `clientWidth` and listed interactive elements under 44 px (inline text links excluded per WCAG 2.5.8):

| Page | 320 | 375 | 390 | 430 | 1280 |
|---|---|---|---|---|---|
| `/` | OK | OK | OK | OK | OK |
| `/claudiandreya` | OK | OK | OK | OK | OK (feed 544 px, centred) |
| `/claudiandreya/posts/{id}` | OK | OK | OK | OK | OK |
| `/discover`, `/wallet`, `/library`, `/subscriptions` | OK | OK | OK | OK | OK |
| `/login`, `/studio`, `/become-creator` | OK | OK | OK | OK | OK |

  After the link fixes, no interactive element under 44 px remains on the guest pages above. Screenshots at 375 and 1280 px show the coral/gold palette, Jakarta font and centred feed rendering as intended.
- Security, isolation and financial checks: N/A (styling only).

## Not covered

- Logged-in variants were not browser-probed. Their controls are `Button` (now at least 44 px by variant) and the account-menu avatar (bumped).
- No real iOS device: safe-area insets are verified by code only.
- `100dvh` is used for the body minimum height; the full-page app shell is US-054.
