# QA Report: TASK-220 — Cari tab UI

**Story:** US-066
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Shared contract added to `packages/shared/src/discover.ts` (`creatorSearchQuerySchema` trimmed 1–50, `creatorSearchResponseSchema`, `CREATOR_SEARCH_LIMIT`, `CREATOR_SEARCH_MAX_LENGTH`)
- [x] `searchCreators(q)` in `lib/api/discover.ts` is a dummy with a `// shortcut:` note naming US-070
- [x] `CreatorSearch` mounted in the Cari panel of `DiscoverView`; reuses the `initials` helper from `lib/utils.ts` (the reel's local copy was removed) and the `primary-ink` token for the "Lihat semua" link
- [x] Top-bar search icon → `/discover?tab=cari` (`home-top-bar.tsx` + its test + `app/page.test.tsx` updated)

### Security
- [x] Query length capped client-side (`maxLength=50`); the server validates again in US-070
- [x] Results rendered as text (React escapes); links are `/${slug}` only

### Accessibility
- [x] Visually hidden `<label for="discover-search">Cari creator</label>`; 48 px input, 16 px font (no iOS zoom)
- [x] Labelled regions "Hasil pencarian" / "Baru dilihat"; remove buttons 44 px with `aria-label="Hapus {name} dari baru dilihat"`; "Mencari…" is `role="status"`, the error is `role="alert"`
- [x] Input autofocuses when the Cari panel mounts: direct `?tab=cari` (top-bar icon) and tapping the tab, which matches "opens with the input focused"

### Code Quality
- [x] 300 ms debounce; an answer for an older query is ignored (latest-query ref) and results are shown only when they match the current query
- [x] Error → "Pencarian gagal." + "Coba lagi"; empty → `Tidak ada creator yang cocok dengan “{query}”.`

## Acceptance Criteria (US-066)

| AC | Result |
|---|---|
| Labelled input; top-bar search opens Cari focused | PASS |
| Debounced results (avatar, name, @slug) open the profile; no-match text | PASS |
| "Baru dilihat": newest first, 5 + "Lihat semua", remove buttons, empty hint | PASS |
| Device storage only, max 20, de-duplicated, updated on any profile open, safe without storage | PASS (TASK-219) |
| Swappable source + component tests | PASS |

## Testing

- `components/discover/creator-search.test.tsx` (7): autofocus, debounced results + link, no-match text, stale-answer ignored, retry after failure, empty hint, recent list 5 → expand 6 → remove.
- `home-top-bar.test.tsx`, `app/page.test.tsx`: Cari link targets `/discover?tab=cari`.
- Full web suite: 120 files / 916 tests pass. ESLint + Prettier clean. `tsc` clean apart from the other session's `studio/earnings/earnings-view.tsx`.

## Notes

- The quote characters in the no-match message are typographic (“ ”) to match Indonesian UI copy.
