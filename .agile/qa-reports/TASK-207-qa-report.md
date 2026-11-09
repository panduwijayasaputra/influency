# QA Report: TASK-207 — Media position column, 5-item limit, ordered reads

**Result:** PASS (2026-11-09)

## Checked
- Migration `20261109054009_media_position`: adds `media_assets.position INTEGER NOT NULL DEFAULT 0`, backfills per post from `(created_at, id)` with `row_number()`, `CHECK (position >= 0)`, index `(post_id, position)`. The backfill test runs the migration's own UPDATE (scoped to one post so parallel specs are untouched) on rows whose id order disagrees with their creation order and gets 0, 1, 2 in creation order. The default of 0 exists only so direct inserts keep working; every API path sets the position, and ties fall back to `created_at, id`.
- Limit: `POST_MEDIA_MAX_PER_POST` is now 5 (design handoff rule). The 6th upload slot answers 409 `MEDIA_LIMIT_REACHED` with `max: 5`; 8 concurrent slot requests on an empty post create exactly 5 rows with positions 0–4 (the post-row lock serializes them); a failed (REJECTED) item does not count.
- New items are appended after the highest position, also after a gap (0, 4 → 5); a negative position is rejected by the database.
- Reads share one order, `MEDIA_ORDER` (`common/media-order.ts`: position, created_at, id): studio list, public post media (kinds and durations), and the media-access list. Checked with items whose creation order differs from their position order.
- Existing specs that reused one post across many tests relied on a limit of 10; they now clear the shared posts' media before each test.
- Full API suite, shared and web tests pass.

## Notes
- Applying the migration with `prisma migrate dev` also applied two earlier committed migrations (`user_onboarding`, `application_plan_price`) that were pending in the local dev database.
- Posts that already hold more than 5 items keep them; only new slots are refused.
