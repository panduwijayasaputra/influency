# QA Report: TASK-186 — `GET /me/following`

**Result:** PASS

- `GET /api/v1/me/following`: `SessionGuard`, `no-store`, query and cursor validated by Zod (400 `VALIDATION_FAILED`). The user id comes only from the session; the raw name-sort query binds it as a parameter.
- Only visible creators (APPROVED, ACTIVE owner) are listed and counted in `total`; the response carries the public creator shape only (exact keys asserted). A cursor from the other sort is ignored.
- `recent` pages through Prisma with a `(created_at, id)` keyset; `name` is case-insensitive A–Z in SQL with a `(lower(display_name), id)` keyset (Prisma cannot order by `lower()`).
- Tests: `following-order.spec.ts` (cursor codec incl. accents and injection-like names), `following.integration.spec.ts` (isolation, both sorts, exclusion of pending/suspended, follow/unfollow reflected, pagination without repeats or gaps when a follow is added mid-paging, cross-sort cursor, 401/400) all pass.
