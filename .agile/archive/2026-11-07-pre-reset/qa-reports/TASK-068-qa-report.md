# QA Report: TASK-068 — Public preview in the feed + public preview route

**Story:** US-048
**Result:** PASS
**Tester:** qa-agent

## Code Review

- [x] Feed `previewUrl` = `/api/v1/creators/:slug/posts/:postId/preview/:previewUuid` for PREMIUM posts with a preview; otherwise null
- [x] `GET :slug/posts/:postId/preview/:previewId`: both ids are uuid-validated before any lookup. It matches the current `preview_key` + PREMIUM + PUBLISHED + `PUBLIC_CREATOR`, with an immutable cache and `nosniff`. No route collision with `me/posts/:id/cover/preview`

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 3 | Public feed shows only the preview | PASS | The feed body has no media id or key and no `post-media/`, `post-previews/` or `post-video/` |
| 4 | No cover → generic placeholder | PASS | `previewUrl: null`; a FREE post with a leftover cover is also null, and its preview route → 404 |

## Tests Run

- [x] `public-post-preview.integration.spec.ts` (new, memory storage): 13 passed. `public-posts.integration.spec.ts` updated

## Issues (if any)

None. Note for US-014: reuse `previewUrl` on the post detail page.
