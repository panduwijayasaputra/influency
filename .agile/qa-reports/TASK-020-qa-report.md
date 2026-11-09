# QA Report: TASK-020 — Viewer-aware public feed (access, viewer, comment count, media kinds)

**Status:** PASS
**Date:** 2026-11-07

## Code Review

### Guidelines Compliance
- [x] Shared:
  - `publicPostSchema` gains `access`, `viewer` (`publicPostViewerSchema`), `commentCount` and `media` (`publicMediaSchema`: `kind` + `durationSeconds`).
  - `publicPostDetailSchema` inherits them, and keeps `status` and the nullable `publishedAt`.
  - No import cycle (`posts.ts` → `post-media.ts`).
- [x] The feed controller uses `OptionalSessionGuard` and passes `req.authSession?.userId ?? null`, never a client value. It keeps `cache-control: no-store`.
- [x] Access uses the pure `decidePostAccess` with facts loaded once: the creator from the slug query, one admin lookup and one batched likes lookup. That is 2 extra queries per page, not per post. `canEngage` and the `canReport` rule are shared with `get()` through `viewerOf`.
- [x] The web `getPublicPosts` forwards only the session cookie, the same as `getPublicPost`.

### Security
- [x] `media` carries kind and duration only. The existing "never exposes media ids, keys or provider uids" test passes against the new body.
- [x] `viewer.liked` reflects only the requesting user's likes. The admin's like on the premium post does not appear for the fan (tested).
- [x] Locked premium stays `locked` for other users. The owner and admins get `full`, the same as the detail rule.
- [x] The unreachable `hidden` branch drops the row instead of leaking it.

### Code Quality
- [x] Media order is READY + `createdAt` asc, matching media-access, so the web can map slots by index.
- [x] `commentCount` excludes soft-deleted comments (a filtered `_count`).

## Acceptance Criteria Verification
- [x] This is the data basis for the US-008 card: access decides preview vs media, the Terbuka chip and Buka; `viewer` drives the like toggle and report; `commentCount` feeds the Komentar label; `media` gives the carousel slots.

## Tests Run
- `public-posts.integration.spec.ts`:
  - The exact anonymous shape: locked premium with `media: [{VIDEO, 9}]`; free `full` with `commentCount: 1` (the deleted comment is excluded).
  - READY-only media, oldest first, with durations.
  - Fan: premium locked, `liked` only on their own like, `canReport`.
  - Owner: all `full`, `canReport: false`.
  - Admin: premium `full`.
  - `PREMIUM_LIKES_WITHOUT_ACCESS=true` → a locked post with `canLike: true` (ENV override app).
- `public-post-detail.integration.spec.ts`: the exact shape includes `commentCount` and `media`.
- Shared `posts.test.ts`: requires `access`, `media`, `commentCount` and `viewer`; rejects an unknown media kind.
- Web `public-posts.test.ts`: no cookie when logged out; forwards only the session cookie when logged in.
- `pnpm check` green: shared 212, web 385, api 628.
