# QA Report: TASK-076 — Public post detail page & feed links

**Story:** US-014
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] App Router server components; only interactivity (`PostMediaViewer`) is a client component
- [x] Typed client in `src/lib/api/public-post.ts` parsing `publicPostDetailSchema`; session cookie forwarded server-side only when present
- [x] cacheComponents: the cached profile renders the shell; the viewer-dependent post streams in `<Suspense>`, same as the creator page (`instant = false`, soft 404)
- [x] Bahasa Indonesia copy, mobile-first `max-w-2xl` layout, Asia/Jakarta dates via shared `POST_DATE`

### Security
- [x] No premium originals, media tokens or signed URLs in SSR HTML/props/metadata: media only via client `PostMediaViewer` → `GET /posts/:id/media-access` (re-checks access); locked view renders only the public blurred `previewUrl`
- [x] `full` / `locked` comes from the API (server-side check), never computed client-side
- [x] Login CTA uses `loginHref` (same-origin relative `returnTo` to this post)
- [x] Metadata built from the public profile only (no post data, no images)

### Financial Integrity (if applicable)
- N/A: display only; no purchase action in this story

### Code Quality
- [x] `PremiumCover` and the date formatter moved to `premium-cover.tsx` and shared by feed and detail (no duplication)
- [x] API outage in `getCurrentUser` treated as logged out; a failing post fetch goes to the error boundary (nothing useful to show without the post)
- [x] Feed cards are single links with hover + `focus-visible` ring, no nested interactive elements

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | `/{creatorSlug}/posts/{postId}` shows a free post in full to anyone | PASS | `full` → caption, meta, `PostMediaViewer` |
| 2 | Premium shows blurred preview, Koin price "akses permanen", subscription option once plans exist | PASS (partial by design) | preview/placeholder + "n Koin · akses permanen" + login CTA; subscription option deferred to US-026/US-027 per the agreed plan |
| 3 | User with access sees the full post + unlocked indication | PASS | `full` premium → viewer + "Sudah terbuka" (owner/admin today; buyers/subscribers once US-050 lands, no change needed) |
| 4 | Draft/archived/removed → not-found to the public | PASS | API 404 → `notFound()` → "Postingan tidak ditemukan"; archived library access is US-050/US-029 |

## Tests Run

- [x] `pnpm check` (format, lint, typecheck, all tests): PASS (shared 187, api 501, web 183)
- [x] `pnpm --filter @influency/web build`: PASS; `/[creatorSlug]/posts/[postId]` is a partial prerender
- [x] New tests: `apps/web/src/lib/api/public-post.test.ts`, `apps/web/src/app/(public)/[creatorSlug]/posts/[postId]/page.test.tsx`, feed link case in `creator-posts.test.tsx`
- [x] Edge cases: no preview → placeholder, owner draft with null date + status label, unknown creator/post → notFound, `getCurrentUser` outage → login CTA, logged in → no CTA, cookie forwarded only when present, `access: 'hidden'` body rejected

## Issues (if any)

None.

## Notes

- Deviation from plan: `generateMetadata` uses the cached profile only (title "{name} · Postingan"); the planned caption description and `noindex` for non-published posts were dropped because a cookie-dependent metadata fetch would make the whole route dynamic under cacheComponents. Non-published posts are only ever visible to their owner/admin, so nothing indexable leaks.
- Hidden posts are a soft 404 (200 + noindex from the not-found boundary), the same accepted shortcut as the creator page.
- Not exercised in a running browser (no Playwright yet; US-045).
