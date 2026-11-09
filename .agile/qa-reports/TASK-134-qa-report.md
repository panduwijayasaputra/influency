# QA Report: TASK-134 — Shared feed contract and interim data source

**Result:** PASS

## Review
- **Contract:** `homeFeedItemSchema` is `publicPostSchema` plus a `creator` object (slug, displayName, avatarUrl) that matches `PostCardCreator`. `homeFeedPageSchema` carries an opaque `nextCursor` (null = end). `HOME_FEED_PAGE_SIZE` is 10. US-025 can return the same shape unchanged.
- **Swappable source:** `fetchHomeFeedPage(cursor, ownSlug)` is the only place that knows where pages come from. The interim body reads the existing public APIs for `DEMO_FEED_SLUGS`, with `credentials: 'include'` so access and likes stay viewer-aware. It carries a `shortcut:` comment naming US-025.
- **No leaks:** it only uses the existing public responses, which already hold previews and no original media. Nothing new is stored client-side.
- **Behaviour:** newest first with an id tie-break, the viewer's own creator dropped, unknown slugs (404) skipped, any other error thrown, and the page is parsed through the shared schema.

## Tests
- `posts.test.ts`: the page schema accepts an item with its creator and rejects one without.
- `home-feed.test.ts`: merge order and creator attachment, own-slug drop, 404 skip, paging 10 + 2 with the cursor, 500 throws.
- `pnpm check` passes (format, lint, typecheck; api 719, web 549).

## Notes
- The seeded demo creators have no posts, so the interim feed is empty on a fresh seed until posts are published in the studio.
