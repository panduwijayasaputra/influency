# QA Report: TASK-180 — `post_saves` model, migration, endpoints and tests

**Result:** PASS

- Migration `20261109031000_post_saves` creates `post_saves` with the unique `(post_id, user_id)` and the `(user_id, created_at)` index; `prisma migrate diff` shows no drift and the schema-conventions spec passes.
- `PUT`/`DELETE /api/v1/posts/:id/save`: session + rate limit (60/min, TBD placeholder) on each handler (the guard reads handler metadata, so class-level `@RateLimit` would not work), CSRF by the global guard, `no-store`. Save needs a non-hidden, PUBLISHED post (404 / `POST_NOT_AVAILABLE`); unsave only deletes the caller's own row, so it works after an archive and leaks nothing.
- Saving never touches entitlements: a locked premium post stays `locked`, `media-access` stays 403, no purchase row appears (tested).
- Tests: `post-saves.integration.spec.ts` covers idempotency, 5 simultaneous saves, 401/403/400/404, draft/archived/removed, owner rules, no-unlock, unsave after archive, rate limit.
