# QA Report: TASK-142 — Web: read the feed API

**Result:** PASS

## Review
- `fetchHomeFeedPage(cursor)` now calls same-origin `GET /api/v1/feed[?cursor=]` with `credentials: 'include'`, parses with `homeFeedPageSchema` and throws on any non-OK status or a page that does not match the contract. The `ownSlug` argument and the client-side aggregation of demo creators are gone; the server excludes the viewer's own posts. `DEMO_FEED_SLUGS` is removed.
- `HomeFeed` and the Home page no longer carry an `ownSlug`: the recommendations fetcher also stopped taking it (done in the US-026 work in the same tree), so the param and the `getMyCreatorProfile` lookup in `page.tsx` were dead and failed lint. Home is now just top bar + feed.
- Loading, error/retry, end note and empty state are unchanged.

## Tests
- `home-feed.test.ts`: first page without a cursor, cursor URL-encoded, 401 and 500 throw, a page that breaks the contract throws.
- `home-feed.test.tsx` and `page.test.tsx` updated for the new signatures; the "own profile left out" page test was removed with the lookup.
- `pnpm check`: format, lint, typecheck pass; shared 231, web 575.

## Notes
- Not checked in a real browser: scrolling through real `/feed` pages.
- `frontend.md` / `codebase-map.md` updated with the endpoint.
