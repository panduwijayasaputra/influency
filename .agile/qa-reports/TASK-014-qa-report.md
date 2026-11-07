# QA Report: TASK-014 — Drawer on the Home top bar, remove old account menu, guidelines

**Status:** PASS
**Date:** 2026-11-07

## Code Review

### Guidelines Compliance
- [x] `AccountEntry` is a server component that reads the session through `getCurrentUser()`, inside `<Suspense>` with a 44 px placeholder, so the bar doesn't shift. `pnpm --filter @influency/web build` lists `/` as a partial prerender (◐).
- [x] `HomeTopBar` takes an `account` slot and defaults to `GuestBurger` (→ `/login`, "Masuk"). The interim `/me` link and its `shortcut:` comment are gone.
- [x] Deleted `AccountMenu`, `UserMenu`, their tests, and the now-unused `KoinBalance`. `KoinIcon` stays. `/me` is a plain placeholder. No stale references (grep clean).
- [x] `CLAUDE.md` and `frontend.md` reserve `following`. `frontend.md` documents the drawer as the single account entry.

### Security
- [x] An API outage is treated as a guest (`.catch(() => null)`), the same rule as the old `UserMenu`. No user data reaches the static shell. The drawer gets `MeResponse` only (id, name, username, roles).

### Code Quality
- [x] Logout is reachable only from the drawer on Home, as stated in the plan's Risks.

## Acceptance Criteria Verification
- [x] The burger opens the drawer for signed-in users.
- [x] The old `account-menu`/`UserMenu` is replaced by the drawer.

## Tests Run
- `home-top-bar.test.tsx`: the guest burger "Masuk" → `/login` by default; the `account` slot replaces it.
- New `account-entry.test.tsx`: user → drawer trigger; guest and API outage → "Masuk" link.
- `app/page.test.tsx`: h1 "Beranda", Cari, Segera hadir, with the account entry suspended.
- `pnpm check` green: shared 207, web 323, api 623. Format, lint and typecheck clean. Web build: 24 routes, `/following` static.

## Notes
- Pre-existing flake, not caused by this story: `auth.integration.spec.ts` › "replayed state" failed once during a full `pnpm check` (session count 47 → 38).
  - It counts *all* sessions, so another spec's parallel cleanup can change the number.
  - It passed 3/3 alone and on the full rerun.
  - Fix later by counting only that `sub`'s sessions.
- Manual UAT (no browser here), at 320–430 px:
  - backdrop-tap close
  - focus return
  - scroll position kept behind the drawer
  - drawer fit and inner scroll
  - Keluar → `/login`
