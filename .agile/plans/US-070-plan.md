# Technical Plan: US-070 — Creator Search API

## Architecture Overview

`GET /api/v1/discover/creators?q=` lives in the `discover` module from TASK-225. It is not `/creators/search`, because that path collides with `GET /creators/:slug`.

The search is one Prisma query over `creator_profiles` with `PUBLIC_CREATOR`, matching `displayName` or `slug` with `contains` + `mode: 'insensitive'` (Prisma parameterizes and escapes the value, so `%`/`_` are literal). The query fetches a small superset, ranks in JS (exact slug → slug prefix → rest, then display name A–Z), and cuts to 20.

The URL path changes from the story's `/creators/search` to `/discover/creators`. The behaviour is the same.

## Dependencies

- TASK-220 (`creatorSearchQuerySchema`, `creatorSearchResponseSchema`), TASK-225 (`discover` module).
- `imageUrl(slug, avatarKey)` from `creator-profile.service.ts`.

## Risks

- **Wildcard escaping.** Prisma's `contains` escapes `%`, `_` and `\` in the value. Verify with a test (`q='%'` must not match everything). If it doesn't escape on this Prisma version, escape them manually before the query.
- **Ranking on a superset.** Fetch `take: 50` ordered by `slug`, then rank and cut to 20. A rare exact match outside the first 50 alphabetical matches could be missed. Add a separate `findFirst` for the exact slug and merge it, so the exact match is always included.
- **Performance.** `ILIKE '%q%'` scans; fine for MVP creator counts. `// shortcut:` add a `pg_trgm` index when creators reach thousands.

## Tasks

### TASK-226: Creator search endpoint + web wiring

- `apps/api/src/modules/discover/creator-search.service.ts`:
  ```ts
  @Injectable() export class CreatorSearchService {
    async search(q: string): Promise<CreatorSearchResponse>
  }
  ```
  - `const needle = q.trim().toLowerCase();`
  - `exact = findFirst({ where: { slug: needle, ...PUBLIC_CREATOR } })`
  - `rows = findMany({ where: { ...PUBLIC_CREATOR, OR: [{ slug: { contains: needle } }, { displayName: { contains: q.trim(), mode: 'insensitive' } }] }, select: { slug, displayName, avatarKey }, orderBy: { slug: 'asc' }, take: 50 })`
  - Merge (dedupe by slug), rank `0` exact slug / `1` slug startsWith / `2` other, then `displayName.localeCompare(…, 'id')`, take `CREATOR_SEARCH_LIMIT = 20` (shared constant). Map to `{ slug, displayName, avatarUrl: imageUrl(slug, avatarKey) }`.
  - Export the ranking as a pure `rankCreatorMatches(needle, rows)` for a unit test.
- `discover.controller.ts`:
  ```ts
  export const CREATOR_SEARCH_RATE_LIMIT = { max: 60, timeWindow: '1 minute' }; // placeholder
  @Get('creators') @UseGuards(RateLimitGuard) @RateLimit(CREATOR_SEARCH_RATE_LIMIT) @Header('cache-control', 'no-store')
  creators(@Query(new ZodValidationPipe(creatorSearchQuerySchema)) { q }) → this.search.search(q)
  ```
  Public. No session is needed (the result doesn't depend on the viewer).
- `packages/shared/src/discover.ts`: add `CREATOR_SEARCH_LIMIT = 20`.
- `apps/web/src/lib/api/discover.ts`: `searchCreators(q)` → `fetch('/api/v1/discover/creators?q=' + encodeURIComponent(q))` → `creatorSearchResponseSchema.parse(...).creators`; non-OK → throw (the UI shows the retry). Remove the dummy list.
- Update `codebase-map.md`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/discover/creator-search.service.ts` | Query + ranking |
| CREATE | `apps/api/src/modules/discover/creator-search.spec.ts` | Unit test of `rankCreatorMatches` |
| MODIFY | `apps/api/src/modules/discover/discover.controller.ts` / `discover.module.ts` | Endpoint + provider |
| CREATE | `apps/api/src/modules/discover/creator-search.integration.spec.ts` | Integration tests |
| MODIFY | `packages/shared/src/discover.ts` | Limit constant |
| MODIFY | `apps/web/src/lib/api/discover.ts` (+ test) | Real fetch |

**Testing:**
- Unit: ranking order exact > prefix > contains, ties by name.
- Integration: matches by name (case-insensitive, e.g. `NADIA`) and by slug; ranking with an exact slug present; `q` `''`/spaces only → 400, 51 chars → 400; `q='%'` and `q='_'` match only creators literally containing them; PENDING/REJECTED creator profiles, suspended users and plain users never appear; response items have exactly `slug, displayName, avatarUrl`; at most 20 results.
