# QA Report: TASK-226 — Creator search endpoint + web wiring

**Story:** US-070
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] `GET /discover/creators?q=` in the `discover` module (not `/creators/search`, which would collide with `GET /creators/:slug`); `CreatorSearchService` provided by `DiscoverModule`
- [x] Query validated with the shared `creatorSearchQuerySchema` (trimmed, 1–50 chars) → 400 `VALIDATION_FAILED`; `RateLimitGuard` `CREATOR_SEARCH_RATE_LIMIT` 60/min (placeholder, per IP since no session is read); `no-store`
- [x] Ranking is a pure, unit-tested `rankCreatorMatches`; the exact slug is fetched separately so the 50-row candidate cut can't drop it
- [x] Web `searchCreators` calls the API; the dummy list is removed

### Security / Isolation
- [x] **Found and fixed in this task:** Prisma `contains` does **not** escape LIKE wildcards (`r_s` matched unrelated slugs on the first run). `escapeLike` escapes `\`, `%` and `_`, and the value stays a bound parameter (no SQL injection).
- [x] Only `PUBLIC_CREATOR` profiles (APPROVED + ACTIVE owner): pending, rejected and suspended creators and plain users never appear
- [x] Response fields are exactly `slug`, `displayName`, `avatarUrl` (asserted); no ids or Telegram data

### Code Quality
- [x] `// shortcut:` note for a future `pg_trgm` index
- [x] Test creators use `LEFTOVER_CREATED_AT` so they can't push other specs' creators out of `GET /creators/recommended` while they exist

## Acceptance Criteria (US-070)

| AC | Result |
|---|---|
| Name or slug contains `q`, case-insensitive; exact → prefix → rest; max 20 | PASS (path is `/discover/creators`; story updated during planning) |
| `q` trimmed 1–50 else 400; wildcards literal, never SQL | PASS |
| slug, name, avatar only; hidden creators/plain users excluded | PASS |
| Rate limited per IP; US-066 uses it | PASS |
| Integration tests | PASS |

## Testing

- `creator-search.spec.ts` (3): `escapeLike`; ranking order; ties by name without mutating the input.
- `creator-search.integration.spec.ts` (9): public/no-store/exact fields; case-insensitive name and slug, trimmed input; ranking with the cap of 20; `%` and `_` literal; hidden creators and plain users excluded; empty, blank, 51-char and missing `q` → 400.
- `apps/web/src/lib/api/discover.test.ts` (+2 cases): encoded query, error statuses.
- Full API suite 108 files / 1,347 tests; full web suite 126 files / 948 tests. ESLint and `tsc` clean in both apps.
