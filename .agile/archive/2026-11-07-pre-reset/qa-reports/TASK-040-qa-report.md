# QA Report: TASK-040 — Public creator page `/{creatorSlug}`

**Story:** US-013
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] App Router `(public)/[creatorSlug]`, server components only, Tailwind + shadcn `Button`, mobile-first single column
- [x] Typed API client in `src/lib/api/` parsing with shared `creatorProfileResponseSchema`
- [x] Next 16 `cacheComponents`: `'use cache'` + `cacheLife('minutes')` on the cookie-free fetch; session read (`LoginCta`) isolated in `<Suspense>`; `instant = false` (documented blocking option) so `params` can be awaited at the top. `next build` passes
- [x] Bahasa Indonesia copy

### Security
- [x] No cookies sent with the cached profile fetch, so no cross-user cache pollution
- [x] Only `<img>` sources are the relative public profile-image URLs; no tokens or signed URLs (verified in the rendered HTML from `next start`)
- [x] `loginHref` → `safeReturnTo`; slug is URL-encoded in the API call
- [x] An API outage while reading the session falls back to logged out, and the public page still renders

### Financial Integrity
- N/A

### Code Quality
- [x] Small, follows `profile-image-input.tsx` for `<img>` and the `UserMenu` pattern for the session read

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Avatar, banner, bio, category, free posts, premium previews, plan price | PASS (agreed scope) | Real avatar/banner with initials/gradient fallbacks; "Konten" / "Langganan" empty states until US-019 / US-026 |
| 2 | Works without login, no Telegram redirect | PASS | `curl /claudiandreya` → 200 full profile, "Masuk" → `/login?returnTo=%2Fclaudiandreya` |
| 3 | Unknown/unapproved/suspended → not-found | PASS | `/doesnotexist`, `/subscriberb` (pending) render "Kreator tidak ditemukan" + `noindex`. HTTP status is 200 (soft 404, see Notes) |
| 4 | No premium media URLs/tokens in HTML/API | PASS | Rendered HTML scanned; no media exists beyond public profile images |
| 5 | Usable at ~375px, in-app browsers | PASS (code review) | Single column, `max-w-2xl`, server-rendered, no third-party scripts. Not tested on a real device |

## Tests Run

- [x] `pnpm check`: PASS (shared 109, api 257, web 90). One run had a single failure in `auth.integration.spec.ts` that did not reproduce in 4 reruns. It looks flaky and isn't related to this change (auth untouched)
- [x] `next build` + `next start` manual run: `/claudiandreya`, `/ClaudiAndreya` 200 profile; `/login`, `/become-creator` unaffected
- [x] New tests: `apps/web/src/lib/api/public-creator.test.ts` (3), `apps/web/src/app/(public)/[creatorSlug]/page.test.tsx` (6)
- [x] Edge cases: no images/bio/category, logged in vs out, API outage, invalid API body, URL-encoded slug

## Issues

None blocking.

### Note 1
**Severity:** minor
**Type:** correctness
**File:** `apps/web/src/app/(public)/[creatorSlug]/page.tsx`
**Description:** Unknown slugs return HTTP 200 with the not-found UI and `noindex`, because the root layout's static shell starts streaming before the page runs (Next 16 docs, `not-found.md` "Status codes"). It's marked as a `shortcut:` in the code. Upgrade path: a Proxy slug check if a real 404 status is needed.

## Notes

- The `auth.integration.spec.ts` flake should be watched in CI.
