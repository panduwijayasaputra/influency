# QA Report: TASK-083 — Like button on the post page and counts on feed cards

**Story:** US-051
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] `LikeButton` is the only client component; the post page and feed stay server components. Uses shadcn `Button`, lucide `Heart`, `loginHref`, shared `postLikeResponseSchema`.
- [x] No rules in the browser: it renders `viewer` from the API (`null` → login link, `canLike` → toggle, else count only); the API re-checks every request.
- [x] Accessibility: `aria-pressed` on the toggle, labels include the count ("Suka · 5 suka"), errors in `role="alert"`, state not shown by color alone (label changes).

### Security
- [x] Same-origin fetch through the `/api/v1` rewrite (browser sends cookie + Origin for CSRF); no secrets.

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Logged-in user can like/unlike | PASS | PUT/DELETE toggle, count from the server |
| 2 | Logged-out visitors see the count and go to login, returning to the post | PASS | Link to `loginHref('/{slug}/posts/{id}')` (page + component tests) |
| 3 | Counts appear on published posts | PASS | Detail page always; feed card meta "n suka" when > 0 |
| 4 | Premium policy | PASS | Count-only when `canLike` is false |

## Test Results

- `like-button.test.tsx` (5 new), `page.test.tsx` (+1), `creator-posts.test.tsx` (+1); fixtures updated in `public-post(s).test.ts`.
- Full `pnpm check`: format, lint, typecheck green; shared 189, web 196, api 564 passed.

## Notes
- Not verified in a running browser (no manual `pnpm dev` pass).
