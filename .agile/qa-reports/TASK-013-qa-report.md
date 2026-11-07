# QA Report: TASK-013 — AccountDrawer component, logout to `/login` and `/following` placeholder

**Status:** PASS
**Date:** 2026-11-07

## Code Review

### Guidelines Compliance
- [x] Built on Radix `Dialog`, the same primitive as `BottomSheet`. Radix provides the backdrop, Escape, outside-tap close, the focus trap, focus return to the trigger, and a body scroll lock (react-remove-scroll) that keeps the page's scroll position.
- [x] Right-side panel `w-[min(20rem,85vw)]` with safe-area padding. The list area is `min-h-0 flex-1 overflow-y-auto`, so the content scrolls at short heights. Slide and fade use tw-animate with `motion-reduce:animate-none`.
- [x] Tokens only (`bg-card`, `bg-primary` avatar, the `koin-*` card, `text-destructive`). Rows are 48 px; the trigger and X are 44 px.
- [x] Indonesian copy. The labels match the AC: Profil Saya, Penghasilan, Jadi Creator, Koleksi Saya, Diikuti, Langganan, Pengaturan, Keluar, Beli Koin.

### Security
- [x] Role-gated items are convenience only. `/studio` and `/admin` are still gated server-side (layout gates + API guards).
- [x] Logout reuses `useLogout` (same-origin POST, HttpOnly cookie). No tokens in JS.

### Code Quality
- [x] The drawer closes when any link is followed. It stays open while logout is pending or after it fails, so the error stays visible.
- [x] Demo Koin balance: marked "Demo", with a `shortcut:` comment.
- [x] `useLogout` now lands on `/login`. Its only other caller, `AccountMenu`, is deleted in TASK-014; its test was updated in the meantime.

## Acceptance Criteria Verification
- [x] Opens from the right with a backdrop and an X. Closes on X, backdrop or Escape. Focus is trapped and returns to the burger.
- [x] Items appear in AC order, plus the agreed role-gated Studio (creators) and Admin (admins). Penghasilan is shown only to creators and Jadi Creator only to non-creators.
- [x] The Koin balance is a dummy and marked as demo. Placeholder links (`/library`, `/following`, `/subscriptions`, `/account/settings`) open "Segera hadir" pages.
- [x] Keluar uses the existing logout flow and lands on `/login`.

## Tests Run
- New `account-drawer.test.tsx` (8 tests):
  - opening sets `aria-expanded`, and Escape returns focus to the trigger
  - X closes the drawer
  - user, `@ana`, the demo Koin card, Beli Koin → `/wallet`, and the USER item order
  - CREATOR+ADMIN item order
  - no `@` line without a username
  - a link click closes the drawer
  - logout → `replace('/login')` + `refresh()`
  - logout failure → alert, and the drawer stays open
- `creators.test.ts` covers the new `following` slug.
- Web: 49 files / 328 tests green. Typecheck and lint clean.

## Notes
- Closing on a backdrop tap is Radix's default `onPointerDownOutside` behaviour. jsdom can't exercise it reliably, so it is listed for manual UAT.
