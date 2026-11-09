# QA Report: TASK-184 — `PublicPostsService.library`, controller and integration tests

**Result:** PASS

- `GET /api/v1/me/library`: `SessionGuard`, `no-store`, query validated by Zod (invalid relation / media / sort / cursor → 400 `VALIDATION_FAILED`). The user id comes only from the session; both joins on `post_saves` / `post_purchases` are bound to it.
- Items go through the same mapper as the feed, so a saved-only premium post is `locked` with only its preview and no media references; `media-access` still returns 403 for it. A purchased post that was archived stays `full`. `toPublicPosts` now uses `publishedAt ?? createdAt` so an archived post cannot crash the mapper.
- Excluded (tested): REMOVED purchases, DRAFT / ARCHIVED saved-only posts, non-APPROVED creators, suspended owners, another user's rows.
- Paging (tested): disjoint and complete pages, `creators` only on the first page, a newer save added between pages is neither repeated nor skipped, `oldest` pages the same way.
- Note: this environment's process time zone (+7) makes the driver adapter store explicit JS `Date` values shifted; the spec therefore compares time differences. Rows written by the app use the database clock and are unaffected.
- Tests: `library.integration.spec.ts` (18) pass. `pnpm check` clean (shared 251, api 1026, web 734).
