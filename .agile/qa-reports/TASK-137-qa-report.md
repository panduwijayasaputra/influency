# QA Report: TASK-137 — Place the block in the Home feed

**Result:** PASS

## Review
- **Placement:** rendered between post 5 and post 6; when the feed has ended with fewer than 5 posts it goes after the last post; in the empty state it sits under the empty copy. It is rendered once. While a short feed still has pages left it is held back, so it never appears before the 5th post would have.
- **Loading:** suggestions are fetched once on mount from a timer callback (the lint rule forbids state changes in the effect body). A failure or an empty list hides the block silently and never affects the feed.
- **Layout:** the section drops its own borders inside the feed list (the list's dividers apply); the empty state wraps it in a top border.

## Tests
- `home-feed.test.tsx` (placement): after the 5th post (as the next sibling, exactly one), after the last post of an ended short feed, held back while pages remain, shown in the empty state, hidden when the request fails.
- `pnpm check` for the packages I changed passes: format, lint, typecheck, shared 230, web 566.

## Notes
- The full-repo `pnpm check` currently fails on formatting of `creator-follows.integration.spec.ts`, which belongs to another session's unfinished US-024 work (migration, follow controller and service are already in the tree). I did not touch those files. The api tests were not rerun for this story; nothing in `apps/api` changed.
