# QA Report: TASK-007 — Bottom nav, AppChrome shell and `me` reserved slug

**Status:** PASS
**Date:** 2026-11-07

## Code Review

### Guidelines Compliance
- [x] `AppChrome` is the only client piece; `BottomNav` stays a server-safe presentational component taking `pathname` as a prop.
- [x] `AppChrome` is mounted once in the root layout inside `<Suspense fallback={null}>` (`usePathname` suspends on unknown dynamic params under `cacheComponents`). `pnpm --filter @influency/web build` prerenders all 22 routes.
- [x] `me` added to `RESERVED_SLUGS` in `packages/shared`.

### Security
- [x] No data, secrets or access logic touched. Web-only shell change.

### Code Quality
- [x] Standalone matching is exact or `prefix/` only, so `/login-help`-style paths keep the nav.
- [x] The spacer sits after `{children}` in `<body>`'s flex column, so pages need no bottom padding. The ad-hoc `BottomNav` mounts and `pb-28` on the creator page and `ComingSoon` are gone (grep clean).
- [x] Active tab: `aria-current="page"`, `text-brand` label/icon and a 2 px `bg-brand` top bar. Tap target is the full 4rem cell.
- [x] The one-way history flag carries the planned `shortcut:` comment.

## Acceptance Criteria Verification
- [x] Four tabs in order with icon + label: Beranda `/`, Jelajahi `/discover`, Dompet `/wallet`, Profil `/me`. Fixed with `pb-[env(safe-area-inset-bottom)]`.
- [x] Visible on regular pages, including a directly opened creator profile; hidden on `/login`, `/studio`, `/admin`, `/become-creator` (onboarding has no route yet; comment marks where it goes).
- [x] `me` is reserved.

## Tests Run
- New `bottom-nav.test.tsx`: tab order/labels/hrefs; active tab for `/`, `/wallet`, `/wallet/topups/x`, `/me`; none for `/meow`, `/ana`, `/ana/posts/1`.
- New `app-chrome.test.tsx`: nav + spacer on 6 paths (incl. `/login-help`); empty on 5 standalone paths; tracker flips only on a pathname change.
- New `in-app-history.test.ts`: flips once, notifies once, unsubscribe works.
- `creators.test.ts`: `me` is shorter than `SLUG_PATTERN`'s 3-char minimum, so its first issue is the pattern message. The assertion now checks the issues *contain* the reserved message (Zod runs the refine too), which still covers every reserved slug.
- Web: 45 files / 304 tests green. Shared: 203 green. Web typecheck, lint and build green.

## Notes
- The global `pnpm` shim fails to switch to v12.14.0 on this machine (ENOEXEC); commands were run via `corepack pnpm`.
