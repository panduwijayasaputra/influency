# QA Report: TASK-047 — Image upload on the studio post edit page

**Story:** US-016
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Page stays a server component; data loaded inside the existing `<Suspense>` (`getMyPost` + `getMyPostMedia` in parallel); interactivity in one client component `post-images.tsx`
- [x] Fetcher added to the existing `studio-posts.ts` (reuses `getAsCreator`: session cookie only, `no-store`, shared schema parse) instead of a new file — smaller than the plan, same behaviour
- [x] shadcn `Button`, Tailwind, mobile-first grid (2 cols, 3 from `sm`); Bahasa copy; limits from shared constants
- [x] Errors branch on the shared error shape (`errorResponseSchema`); generic message when the storage PUT fails

### Security
- [x] No secrets client-side; the presigned URL lives only in component memory for one upload and is never rendered or logged
- [x] R2 PUT sent without credentials (cross-origin default); API calls use `credentials: 'include'`; same-origin requests carry `Origin` for the CSRF guard
- [x] Images rendered from the owner-only API route (`private, no-store`), plain `<img>` (no `next/image` proxy/cache of private bytes)
- [x] Client type/size check is UX only; the API re-checks bytes on complete

### Creator / user isolation
- [x] All reads/writes go to `/creators/me/...` (API enforces ownership); a foreign/unknown post shows "Post tidak ditemukan."

### Financial Integrity
- N/A

### Code Quality / Accessibility
- [x] Visible label "Tambah gambar", hint + `aria-live="polite"` status linked via `aria-describedby`; delete buttons have `aria-label="Hapus gambar N"`; images have `alt="Gambar N"`; input disabled while pending and at the limit
- [x] No `CSP` in `next.config.ts`, so nothing blocks `connect-src` to R2

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Short-lived, scoped upload URL only to the owner | PASS | UI requests a slot per file and uses it once |
| 2 | Allowed types/sizes, checked by content | PASS | client pre-check (UX) + API `complete` error shown |
| 3 | Private storage, no permanent public URL | PASS | thumbnails via the session-guarded preview route |
| 4 | Local dev adapter | PASS | verified live with the default `STORAGE_DRIVER=local` |

## Tests Run

- [x] `pnpm check` (format, lint, typecheck, all tests): PASS — shared 133, api 311, web 120
- [x] New: `post-images.test.tsx` (9) — img src/alt + count, GIF / 11 MB rejected without fetch, slot → PUT (exact URL/headers/body, no credentials) → complete → refresh, input disabled while uploading, slot 409 message, failed PUT skips complete, 415 from complete shown, disabled at 10 images, delete + refresh; `studio-posts.test.ts` + 3 for `getMyPostMedia` (URL/cookie/no-store, 400/401/403/404 → null, 500 throws, no cookie → no fetch)
- [x] Live API flow through the Next proxy (see TASK-046 report); browser UI itself not clicked through — covered by component tests

## Issues

None.
