# TASK-143 QA: Recommended creators endpoint — PASS
- `recommended-creators.integration.spec.ts` (4 tests): guest 401; self/followed/unapproved/suspended excluded; order followers desc then newest; limit 15; public-fields-only; `GET /creators/:slug` unaffected.
- `recommended` added to `RESERVED_SLUGS` (shared slug test iterates the list). api typecheck clean, creators tests 51 pass.
- Note: `pnpm lint` in api fails on `posts/feed.integration.spec.ts:123` (US-025 work in progress, not this task).
