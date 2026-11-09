# QA Report: TASK-008 — PageHeader, restyled ComingSoon, Beranda and `/me` placeholders

**Status:** PASS
**Date:** 2026-11-07

## Code Review

### Guidelines Compliance
- [x] `PageHeader` is the only new client component. It uses `useRouter` only (no `usePathname`), so it needs no Suspense; `pnpm --filter @influency/web build` is green and `/me` prerenders as a partial prerender (the `UserMenu` streams).
- [x] Copy is Bahasa Indonesia. Back control is labeled "Kembali", 44 px (`size-11`), with a focus ring.

### Security
- [x] `UserMenu` moved unchanged: it still falls back to "Masuk" on API outage and reads the session server-side. No tokens in JS.

### Code Quality
- [x] Hydration: `useSyncExternalStore` server snapshot is `false`, so SSR HTML never contains the history-based back button.
- [x] `SiteHeader` and `/account` (profile placeholder) are deleted. `/account/settings` remains. `account` stays reserved. No stale imports (grep clean in `apps/web/src`).
- [x] Deviation from plan: the title pads `pl-2` (not `pl-4`) when there is no back button. With the container's `px-2`, that gives the stated 16 px gutter.
- [x] Found and fixed during dev: a template-literal class join was collapsed by the Prettier Tailwind plugin (`font-boldpl-2`); replaced with `cn()`.

## Acceptance Criteria Verification
- [x] Beranda, Jelajahi, Dompet and Profil show the "Segera hadir" placeholder in the Light Social style (`bg-accent` pill, `text-primary-ink`).
- [x] Non-Home placeholders use the simple page header. Back appears only after in-app navigation (or via an explicit fallback).
- [x] `/me` hosts the interim account entry (Masuk / Koin balance + account menu with Keluar) until US-005.

## Tests Run
- New `page-header.test.tsx`: no back on a direct visit; fallback link; history button calls `router.back()` after the flag flips post-mount; `h1` only with `asHeading`.
- New `coming-soon.test.tsx`: h1, pill, description, children.
- `user-menu.test.tsx` (moved from `site-header.test.tsx`): 3 existing cases pass.
- `account-menu.test.tsx`: Profil → `/me` for non-creators.
- `page.test.tsx` (Home): h1 "Beranda" + "Segera hadir".
- Web: 47 files / 308 tests green. Typecheck, lint, build green.
