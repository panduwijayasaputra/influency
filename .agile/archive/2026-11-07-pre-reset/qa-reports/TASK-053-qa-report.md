# QA Report: TASK-053 — Studio "Harga & Akses" section on the post edit page

**Story:** US-018
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] `post-offer-form.tsx` is the only new client component; `page.tsx` stays a server component and renders it only for PREMIUM posts
- [x] Limits come from the shared constants (`min`/`max` attributes + `setPostOfferSchema` pre-check); the API re-validates (UX check only, no financial logic in the browser)
- [x] `byField` from `post-form.tsx` made generic and reused instead of copied
- [x] `PostForm` already calls `router.refresh()` after saving, so the section appears/disappears when visibility changes

### Security
- [x] Same-origin `fetch` with `credentials: 'include'`; CSRF Origin enforced by the API

### Accessibility
- [x] Inputs labelled ("Harga (Koin)", "Durasi akses (hari)"), `inputMode="numeric"`, errors linked via `aria-describedby` + `aria-invalid`, `role="alert"` / `role="status"` messages; section labelled by its heading

### Creator / user isolation
- N/A (UI; API enforces, TASK-052)

### Financial Integrity
- N/A (display/input only; versioning is server-side)

### Code Quality
- [x] Mirrors `PostForm` structure (pending state, error mapping, "Tersimpan.")

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Set whole-Koin price + duration within limits | PASS | Two number inputs, client pre-check, PUT |
| 2 | Price > 0, duration positive | PASS | 0 / empty / decimals / > max rejected before fetch |
| 3 | Change → new version, future purchases only | PASS | "Versi n" label + helper text "hanya berlaku untuk pembelian berikutnya" |
| 4 | Existing buyers keep terms | PASS | Server side (TASK-052) |

## Tests Run

- [x] `post-offer-form.test.tsx` 8 passed: empty state, prefill + version label, 4 client validation cases without fetch, PUT body + "Tersimpan." + refresh, API error message
- [x] `pnpm check` PASS: shared 153, web 133, api 369

## Notes
- No page-level test exists for `/studio/posts/[postId]`; the "hidden for FREE posts" condition is a one-line check left for UAT.
