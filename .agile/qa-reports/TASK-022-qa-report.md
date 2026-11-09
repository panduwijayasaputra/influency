# QA Report: TASK-022 — PostCard component

**Status:** PASS
**Date:** 2026-11-07

## Code Review

### Guidelines Compliance
- [x] `useMediaAccess(postId, enabled)` is extracted unchanged from `PostMediaViewer` (fetch, 403 → locked, 404 → missing, schema parse, retry, refresh 60 s before expiry). Its `idle` state fetches nothing. `PostMediaViewer` uses it, and its 6 tests pass unchanged. `MediaItemView` is shared by both, with an optional sizing `className`.
- [x] `PostCard` is client-side and shows:
  - **header:** avatar or initials, name, `@slug`, `<time dateTime suppressHydrationWarning>` with `formatRelativeTime`, and the Radix "Lainnya" menu (Bagikan, plus Laporkan when `canReport`, or a login link for guests)
  - **media:** a 4:5 frame
  - **actions:** Suka, Komentar → `#komentar`, Bagikan, Simpan, and Kirim Tip on the right
  - **caption:** 2 lines, with Selengkapnya/Sembunyikan
- [x] Reuse of existing components: `LikeButton`, `ReportPostButton` (new controlled mode, rendered outside the menu so the sheet survives the menu closing), `ShareButton` (new optional same-origin `url` + `label`), `PurchaseSheet`, `PremiumCover` and `KoinIcon`-style tokens.
- [x] Tokens only. The overlay chips use `bg-black/60 text-white` (an allowed exception). Every control is 44 px.

### Security
- [x] **Locked premium never calls media-access**, and renders only `previewUrl` (the server-blurred cover) or the lock placeholder (tested for a guest and a signed-in user).
- [x] Media URLs are fetched in the browser only, when the card is within 200 px of the viewport. `renderToString` of an accessible card contains no signed URL and no `media-access` (tested).
- [x] Guest actions (Bagikan, Simpan, Laporkan, Buka, Like) link to `/login?returnTo=%2F{slug}`. Kirim Tip is not offered to guests or on your own post (`canReport` false = own post; commented).

### Code Quality
- [x] Deviation from the plan: while loading, the card shows a fixed 4:5 frame with an sr-only "Memuat media…" instead of per-kind skeleton slots. The frame size is the same, so there is still no layout jump; per-kind slots add nothing visible. On `failed` it shows "Gagal memuat media." with **Coba lagi**.
- [x] The carousel is CSS scroll-snap, with the index from `onScroll`, an "n/total" pill, decorative dots, and `region`/`carousel`/`slide` roles. A single item has no indicators.

## Acceptance Criteria Verification
- [x] Header with avatar, name, @slug, relative time (`Intl.RelativeTimeFormat('id')`, the Asia/Jakarta date after 7 days) and the Lainnya menu (Bagikan, Laporkan).
- [x] A swipeable carousel with dots and n/total, and a fixed 4:5 ratio.
- [x] Locked premium: preview, Premium chip, "n foto · n video", Buka · n Koin → the demo purchase sheet (or login).
- [x] Accessible media through media-access, and the Terbuka chip on accessible premium.
- [x] Suka as today; Bagikan shares the post URL; Komentar → detail `#komentar`; Simpan and Kirim Tip → "Segera hadir"; guests → login.

## Tests Run
- New `post-card.test.tsx` (11 tests):
  - header and menu
  - locked guest and locked signed-in: no fetch, preview src, summary
  - Buka → login or sheet
  - lazy fetch URL, 3 slides, "1/3", carousel region
  - failure → Coba lagi refetches
  - Terbuka + Kirim Tip toast, and no tip on your own post
  - Komentar href + count, Simpan toast
  - guest actions are login links, with no tip
  - long caption expands, and the caption links to the post
  - SSR markup has no media URLs
- New `relative-time.test.ts`: "baru saja", minutes, hours, days, the date after a week, and a future timestamp.
- Existing `post-media-viewer`, `report-post-button` and `share-button` tests pass.
- Web: 53 files / 402 tests green. Typecheck and lint clean.
