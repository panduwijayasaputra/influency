# QA Report: TASK-043 — Studio posts pages (`/studio/posts`, `/new`, `/[postId]`)

**Story:** US-015
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] App Router pages under the existing `studio/` layout (`StudioGate`); server components except `PostForm` (`'use client'`, form interactivity)
- [x] Session-reading parts and route params stream inside `<Suspense>` (cacheComponents), like `studio/profile`
- [x] Typed fetchers in `src/lib/api/studio-posts.ts` parse with shared schemas, forward only the session cookie, `cache: 'no-store'`
- [x] Form validates with shared `createPostSchema` / `updatePostSchema`, maps API `details.issues` by path, branches on `error.code`
- [x] Tailwind + shadcn (`Button`, `buttonVariants`, `Label`, `Textarea`), Bahasa copy, mobile-first `max-w-md` column
- [x] No new top-level route → `RESERVED_SLUGS` unchanged

### Security
- [x] Browser mutations go same-origin to `/api/v1` with `credentials: 'include'` (browser sends `Origin`, passes `CsrfGuard`)
- [x] Web gate is UX only; the API enforces `ApprovedCreatorGuard` + ownership (TASK-042)
- [x] Post ids from the URL are `encodeURIComponent`-ed in the server fetch; malformed/unknown/foreign ids render "Post tidak ditemukan."

### Accessibility
- [x] Caption has a label, live count via `aria-describedby`, `aria-invalid` on error; visibility is a native radio group in `fieldset`/`legend`; errors announced via `role="alert"` / `role="status"`; focus-visible style on list links

### Financial Integrity
- N/A

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Create with caption, FREE or PREMIUM | PASS | `/studio/posts/new`; visibility required client- and server-side |
| 2 | Posts start as DRAFT, not public | PASS | Edit page shows "Status: Draf"; no public post page yet (US-014) |
| 3 | Studio lists own posts with status | PASS | `/studio/posts` shows caption + "Premium · Draf" |
| 4 | Other creator's post → not found | PASS | creatorB opening Claudia's post URL → "Post tidak ditemukan." |

## Tests Run

- [x] `pnpm check` (format, lint, typecheck, all tests): PASS — shared 117, web 105 (21 files), api 268 (25 files)
- [x] `pnpm --filter @influency/web build`: PASS (`/studio/posts`, `/new`, `/[postId]` partial prerender)
- [x] New: `post-form.test.tsx` (5), `studio-posts.test.ts` (fetchers: no cookie, cookie forwarding, null statuses, 500 throws)
- [x] Manual smoke against the running dev servers (dev login): Claudia created a PREMIUM draft via the API; `/studio/posts` lists it as "Premium · Draf"; edit page renders it; creatorB gets "Post tidak ditemukan." on the page and 404 `NOT_FOUND` from the API; `/studio/posts/new` renders the form

## Issues

- Fixed during QA: `getMyPosts`/`getMyPost` returned `unknown` (`body && parse(body)`); changed to an explicit null check. Typecheck green.

## Notes

- Pre-existing, not in scope: a logged-out visit to any `/studio/*` page (including `/studio/posts`) redirects to `/login?returnTo=/studio`, not the original sub-path, because `StudioGate` hardcodes `/studio`.
- The manual smoke left one draft post ("UAT draf premium") for Claudia in the local dev DB.
