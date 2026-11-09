# QA Report: TASK-051 — Video upload and processing status on the studio post page

**Story:** US-017
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] `post-images.tsx` → `post-media.tsx` (`PostMedia`), test renamed with `git mv`; `page.tsx` updated; still the only client component, page stays a server component
- [x] Shared constants drive the `accept` list, hint text and client pre-check (UX only; server re-checks)
- [x] Mutating API calls keep `credentials: 'include'`; provider/storage uploads send no credentials

### Security
- [x] No video URL, uid or player rendered; video cards show status text only (playback is US-021)
- [x] Stream upload is a multipart POST with the file under `formField`; no custom headers

### Accessibility
- [x] Status is text ("Memproses…", "Siap · m:ss"), not color only; delete buttons labelled "Hapus video n" / "Hapus gambar n"; upload status in the existing `aria-live="polite"` region; input label "Tambah gambar atau video"

### Creator / user isolation
- N/A (UI; API enforces)

### Financial Integrity
- N/A

### Code Quality
- [x] Polling is one `useEffect` keyed on "any PROCESSING" — `router.refresh()` every 5 s, cleared on unmount / when nothing is processing

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Creator uploads a video | PASS | slot → POST multipart (Stream) or PUT (stub) → complete |
| 2 | Processing status until ready | PASS | "Video sedang diproses…" after complete, "Memproses…" card, auto refresh until "Siap" |

## Tests Run

- [x] `post-media.test.tsx` 19 passed (new: oversized/unsupported video pre-check, multipart POST upload without credentials + "Video sedang diproses…", video cards with status/duration and no `<img>`/`<video>`, 5 s refresh only while processing and cleared on unmount)
- [x] `pnpm check` (format, lint, typecheck, test) PASS: shared 141, web 125, api 355
- [x] Manual end-to-end against the built API (stub driver, local storage, dev login as claudia): slot → PUT `sample.mp4` to the dev-storage URL (204) → complete PROCESSING → list READY after ~5 s → video `content` 404 → delete 204 and `.local-storage/post-video/` emptied. Request logs show the dev-storage path without the token query. The test draft was removed afterwards.
- [ ] Browser click-through of the studio page not done (covered by component tests + the API run above)
