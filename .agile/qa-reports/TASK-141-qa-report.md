# QA Report: TASK-141 — Feed endpoint

**Result:** PASS

## Review
- **Endpoint:** `GET /api/v1/feed?cursor=` behind `SessionGuard` (guest 401), `cache-control: no-store`. The cursor is validated by `feedCursorSchema` (malformed → 400 `VALIDATION_FAILED`). It returns the shared `HomeFeedPage` (10 items, opaque `nextCursor`, null at the end).
- **Query:** `status = PUBLISHED`, `creatorProfile` matches `PUBLIC_CREATOR` (APPROVED + ACTIVE user) and `userId != viewer`. Drafts, archived, removed, held (PENDING_REVIEW) posts and posts of unapproved or suspended creators are excluded.
- **Order and paging:** `FEED_ORDER` (publishedAt desc, id desc) and the `<ms>_<uuid>` keyset cursor live only in `feed-order.ts`, marked as a PLACEHOLDER. A post published after page 1 sorts above the cursor, so page 2 neither repeats nor skips a post.
- **One mapper:** `list()` and `feed()` now share `toPublicPosts` (admin lookup, batched likes, `decidePostAccess`, `canEngage`, `viewerOf`). The existing `public-posts` spec passes unchanged, so the creator profile output did not change.
- **Premium:** a locked premium post carries only `previewUrl`, the price and media kind/duration. The response contains no storage key, `objectKey`, `videoUid`, signature or signed URL (asserted on the raw body).
- **Mutation check:** removing the own-post exclusion makes "leaves out the viewer's own posts" fail.
- **Money / ledger:** not touched.

## Tests
- `feed-order.spec.ts`: cursor round trip into the keyset filter, 7 malformed cursors rejected.
- `feed.integration.spec.ts` (12): guest 401 + no-store, newest first with 10 per page, no duplicates or gaps across pages + creator object, a post published after page 1, own posts excluded, all six excluded post/creator kinds, locked premium preview-only with no leak, admin gets `full`, `viewer.liked`, 3 bad cursors.
- `pnpm check`: format, lint and typecheck pass; shared 231, web 575.

## Notes
- The spec uses `home-feed-spec-*` slugs, session tokens and 2099 publish dates: the existing `public-posts` spec already uses `feed-spec-*` and the feed is global, so other specs' posts can sit below mine but never above.
- No `(status, published_at, id)` index yet; a `shortcut:` comment says to add one when the query gets slow.
