# QA Report: TASK-031 — `/become-creator` page and application form

**Story:** US-010
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Route `(subscriber)/become-creator/`; page is a server component; session reads happen inside `<Suspense>` (cacheComponents). `next build` passes; `/become-creator` is partial-prerendered
- [x] Status view in `become-creator.tsx` (testable, like `studio-gate.tsx`); only the form is `"use client"`
- [x] API access via `src/lib/api/creator-application.ts` (forwards only the session cookie, `no-store`, parses with the shared `creatorApplicationResponseSchema`); no new web dependency (no `zod` import in web)
- [x] Client validation reuses the shared `creatorApplicationSchema`; errors branch on `error.code`, not message text
- [x] shadcn `input`, `textarea`, `label` generated with the pinned CLI (no package changes); native checkbox; Bahasa copy; mobile-first single column

### Security
- [x] Web view is UX only; the API (TASK-030) enforces auth, uniqueness and one-application rules
- [x] Same-origin POST with `credentials: 'include'` (browser sends `Origin`, passes the CSRF guard); no tokens in JS
- [x] Login redirect via `loginHref('/become-creator')` → `safeReturnTo`

### Financial Integrity
- N/A

### Code Quality
- [x] Accessible: labels bound by `htmlFor`/`id`, `aria-invalid` + `aria-describedby` on invalid fields, `role="alert"` form error, button disabled while pending
- [x] Header shows "Jadi Kreator" instead of "Studio" for non-creators

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Collects display name, slug, bio/category, agreement acceptance | PASS | All five controls; agreement placeholder note (documents TBD) |
| 2 | Lowercase normalization, permitted chars, unique | PASS | Live preview `influency.com/{lowercased}`; `SLUG_TAKEN` shown on the slug field |
| 3 | Reserved names rejected with a clear message | PASS | `Admin` → "Alamat ini dipakai oleh sistem. Pilih alamat lain." before any request |
| 4 | PENDING_REVIEW; no second application while pending | PASS | Pending → notice, no form; approved → Studio link; rejected → prefilled form |

## Tests Run

- [x] `pnpm --filter @influency/web test`: 12 files, 60 passed (new: `become-creator.test.tsx` 5, `creator-application-form.test.tsx` 7, header "Jadi Kreator" case)
- [x] web typecheck, lint, prettier, `next build`: pass
- [x] Smoke with `pnpm dev` + dev login: Subscriber A → form, `{ application: null }`; Claudia → "Anda sudah menjadi kreator." + Studio link; logged out → redirect to `/login?returnTo=%2Fbecome-creator`. No application was submitted (demo data untouched)
