# QA Report: TASK-010 — HomeTopBar with hide-on-scroll on Home

**Status:** PASS
**Date:** 2026-11-07

## Code Review

### Guidelines Compliance
- [x] `HomeTopBar` is a small client component that renders on Home only, via `ComingSoon`'s new `header` prop. Other pages still get `PageHeader`.
- [x] Copy is in Indonesian: "Influency, ke atas Beranda", "Cari", "Notifikasi" / "Notifikasi, ada aktivitas baru", "Buka menu akun".
- [x] Tokens only: `bg-card`, `bg-brand` (logo mark, no text), `bg-primary` dot, `hover:bg-muted`. Every control is a `size-11` (44 px) target with a focus ring.

### Security
- [x] No data, auth or access logic. The burger is a plain link to `/me`.

### Code Quality
- [x] The scroll listener is passive and removed on unmount. `setHidden(fn)` lets React bail out when the value is unchanged, so there is no re-render per scroll event.
- [x] `onFocusCapture` shows the bar, so keyboard focus never lands in a hidden bar.
- [x] Reduced motion: `motion-reduce:transition-none` on the bar, and the logo scroll-to-top uses `behavior: 'auto'`.
- [x] Home keeps exactly one `<h1>` (sr-only "Beranda").
- [x] The planned `shortcut:` comment on the burger is in place for US-005.

## Acceptance Criteria Verification
- [x] On Home only: logo (scrolls to top) · Cari → `/discover` · bell → `/notifications` · burger. The burger links to `/me` until US-005, as agreed with the user.
- [x] Hides on scroll down and shows on scroll up or near the top. It snaps instead of sliding under reduced motion.
- [x] Indonesian `aria-label`s and 44 px targets. The unread dot is supported but off by default, as agreed with the user.

## Tests Run
- New `home-top-bar.test.tsx`: `nextHidden` table (6 cases); link order, labels and hrefs; dot off by default and on with `hasUnread`; scroll sequence 300 → 302 → 290 → 400 → 20; focus re-shows the bar; the logo calls `scrollTo({ top: 0, behavior: 'auto' })` under reduced motion.
- `coming-soon.test.tsx`: a custom header replaces `PageHeader`, and the sr-only h1 is the title.
- `app/page.test.tsx`: h1 "Beranda", the Cari link, and no "Kembali".
- Web: 48 files / 320 tests green. Typecheck and lint clean.

## Notes
- The Beranda placeholder doesn't scroll, so the hide behaviour is verified by unit tests only until the feed exists.
