# QA Report: TASK-023 — PostCard list on the creator page, remove the old grid, docs

**Status:** PASS
**Date:** 2026-11-07

## Code Review

### Guidelines Compliance
- [x] `CreatorPosts({ creator })` renders one `PostCard` per feed post (API order, newest first), full-bleed (`-mx-5`) with dividers. The empty and outage messages are unchanged.
- [x] `CreatorView` passes `{ slug, displayName, avatarUrl }`. The `signedIn` prop is gone, because the card reads `post.viewer` (null = guest).
- [x] `post-grid.tsx` is deleted (the 2-column tiles and the Gratis/Premium chips), with no references left. `premium-cover.tsx` stays (used by the card and the post page).
- [x] `frontend.md` documents lazy media through `useMediaAccess`, locked cards never calling media-access, and `MediaItemView` reuse.

### Security
- [x] The US-007 guest rules on the creator page carry over through the card: a locked premium Buka → login, and other actions → login (`post-card.test.tsx`).
- [x] The feed is fetched server-side with only the session cookie forwarded (TASK-020). Media URLs are browser-only (TASK-022).

## Acceptance Criteria Verification
- [x] The creator page lists posts as PostCards: header, carousel, locked preview, actions, caption.
- [x] The old grid is replaced. The Postingan/Grid tabs and the new Grid come in US-011.

## Tests Run
- `creator-posts.test.tsx` (rewritten): one article per post in feed order, the slug passed to the feed, empty for `[]`/`null`, and the outage message.
- The old grid tests (chips, tile sheet, top-up) are removed with the grid. Their purchase-sheet and guest-link behaviour is covered by `post-card.test.tsx`.
- `pnpm check` green: shared 212, web 394, api 643. The web build lists `/[creatorSlug]` as a partial prerender.

## Notes
- Manual UAT (no browser here), at 320–430 px:
  - swiping the carousel updates n/total and the dots
  - locked cards make no media-access request (DevTools Network)
  - free media appears while scrolling
  - guest actions → `/login` and back
  - no horizontal page scroll
