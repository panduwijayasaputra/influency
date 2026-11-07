# TASK-144 QA: Web reads the recommendations API — PASS
- `fetchRecommendedCreators()` calls same-origin `/api/v1/creators/recommended` (credentials include), parses with the shared schema, throws on error (block hides).
- `DEMO_RECOMMENDED_SLUGS` and the `ownSlug` argument removed; `HomeFeed` fetches once per mount (test added), so a followed card stays "Diikuti".
- web tests (home-feed, lib/api, page) 73 pass; web lint and typecheck clean.
