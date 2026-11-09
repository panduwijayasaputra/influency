# QA Report: TASK-183 — Library query helpers (SQL + cursor)

**Result:** PASS

- `library-query.ts`: every user value (user id, creator slug, media kind, cursor parts, page size) is a bound `Prisma.sql` parameter; the sort direction comes from a closed enum. A unit test proves an injection string never reaches the SQL text.
- Times are compared and returned as epoch milliseconds (`extract(epoch …)::bigint`) because a raw timestamptz can be shifted by the driver adapter (see `dbNow`). The keyset is `(added_ms, post_id)` in both directions.
- Availability: purchased posts stay while PUBLISHED or ARCHIVED, saved-only posts only while PUBLISHED; creator APPROVED and owner ACTIVE (mirrors `PUBLIC_CREATOR`, covered by the integration spec).
- Tests: `library-query.spec.ts` (11) pass.
