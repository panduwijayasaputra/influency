# Technical Plan: US-045 — Collection (Library) API

## Architecture Overview

`GET /api/v1/me/library` (signed in, `no-store`) returns the caller's saved and bought posts. It never writes, so there are no financial locks; the money-adjacent rule is isolation and access: the user id comes only from the session, and every item goes through the same entitlement mapper (`PublicPostsService.toPublicPosts`) as the feed, so a saved-only premium post comes back **locked with only its preview**.

Two steps per request:

1. **Pick the page** with one raw SQL query that joins `posts` with the caller's `post_saves` and `post_purchases` rows and returns `(post_id, saved, purchased, added_at)` in keyset order. Prisma cannot express this union with `GREATEST`, so `$queryRaw` + `Prisma.sql` is used, with every value parameterised.
2. **Load and map** the page's posts with the usual `readyMedia`/`currentOffer`/`counts` includes, re-sort them into the SQL order, run `toPublicPosts`, and attach `saved`, `purchased`, `addedAt`.

Availability (matches the feature decisions and spec §4.1):
- A **purchased** post is listed while `status IN ('PUBLISHED','ARCHIVED')`. `REMOVED` (legal takedown) is excluded.
- A **saved-only** post is listed only while `PUBLISHED`.
- The creator must be public: `creator_profiles.status = 'APPROVED'` and the owner user `ACTIVE` (the SQL repeats `PUBLIC_CREATOR`; add a comment pointing at it and a test that fails if they diverge).
- "Dibeli" means a `post_purchases` row. A subscription never puts a post in the collection.

`toPublicPosts` currently assumes `PUBLISHED` rows (`row.publishedAt!`). For archived purchases use `row.publishedAt ?? row.createdAt` and widen the comment; access for archived-and-paid posts is already handled by `decidePostAccess`/`PaidAccessService`.

Cursor: `<addedAt ms>_<postId>` (same shape and style as `feed-order.ts`, reuse its regex approach). Because `added_at` columns are `timestamptz(3)`, a millisecond cursor is exact. Keyset compare: `(added_at, p.id) < (cursor)` for `recent` and `>` for `oldest`. Items added while paging land before the cursor in `recent` and are not repeated or skipped. Any post that the mapper later drops (access `hidden`) is dropped from the page but the cursor still comes from the SQL rows, so nothing is skipped.

## Dependencies

- US-044 (the `post_saves` table) and US-040 (query / item schemas and the dummy function).

## Risks

- Raw SQL table/column names drift from Prisma. Mitigation: use the `@@map`/`@map` names from `schema.prisma` (`posts`, `post_saves`, `post_purchases`, `creator_profiles`, `users`, `media_assets`) and cover each filter with an integration test.
- Privacy: a bug could return another user's rows. Mitigation: `$1` is the session user in both joins and an isolation test with two users.
- Cursor from a different sort misleads paging. Mitigation: the cursor is only a position; wrong-sort use returns a valid but odd page, never an error or leak. Document it.

## Tasks

### TASK-183: Library query helpers (SQL + cursor)

Create `apps/api/src/modules/posts/library-query.ts`:

- `libraryCursorSchema`, `encodeLibraryCursor({ addedAt: Date; id: string })`, `parseLibraryCursor(cursor)` (regex like `feed-order.ts`).
- `libraryPageSql(userId: string, q: LibraryQuery & { take: number })` returning `Prisma.Sql`:

```sql
SELECT p.id AS "postId",
       (ps.id IS NOT NULL) AS "saved",
       (pp.id IS NOT NULL) AS "purchased",
       GREATEST(ps.created_at, pp.created_at) AS "addedAt"
FROM posts p
JOIN creator_profiles cp ON cp.id = p.creator_profile_id AND cp.status = 'APPROVED'
JOIN users u ON u.id = cp.user_id AND u.status = 'ACTIVE'
LEFT JOIN post_saves ps ON ps.post_id = p.id AND ps.user_id = ${userId}::uuid
LEFT JOIN post_purchases pp ON pp.post_id = p.id AND pp.user_id = ${userId}::uuid
WHERE ((pp.id IS NOT NULL AND p.status IN ('PUBLISHED','ARCHIVED'))
    OR (ps.id IS NOT NULL AND p.status = 'PUBLISHED'))
  -- relation: saved → AND ps.id IS NOT NULL; purchased → AND pp.id IS NOT NULL
  -- creator:  AND lower(cp.slug) = lower(${creator})
  -- media:    AND EXISTS (SELECT 1 FROM media_assets m WHERE m.post_id = p.id AND m.status = 'READY' AND m.kind = 'IMAGE'|'VIDEO')
  -- cursor:   AND (GREATEST(ps.created_at, pp.created_at), p.id) < (${ts}, ${id}::uuid)   -- '>' for oldest
ORDER BY "addedAt" DESC, p.id DESC                                                       -- ASC, ASC for oldest
LIMIT ${take}
```

Build the optional clauses with `Prisma.sql` fragments and `Prisma.empty`; never string-concatenate user values. The ORDER BY direction comes from a closed enum, not user text. Check the enum names (`UserStatus`, `PostStatus`, `MediaStatus`, `MediaKind`) in `schema.prisma` and cast literals if Postgres complains.
- `libraryCreatorsSql(userId)`: same FROM/JOIN/availability, no relation/creator/media/cursor, `SELECT DISTINCT cp.slug, cp.display_name ORDER BY lower(cp.display_name), cp.slug`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/posts/library-query.ts` | SQL + cursor |
| CREATE | `apps/api/src/modules/posts/library-query.spec.ts` | cursor round-trip, malformed cursor rejected |

**Testing:** unit tests for the cursor (round-trip, reject garbage and wrong shapes). SQL itself is covered by TASK-184's integration tests.

---

### TASK-184: `PublicPostsService.library`, controller and integration tests

- `PublicPostsService.library(userId: string, q: LibraryQuery): Promise<LibraryPage>`:
  1. `rows = await prisma.$queryRaw<…>(libraryPageSql(userId, { ...q, take: LIBRARY_PAGE_SIZE + 1 }))`; `pageRows = rows.slice(0, LIBRARY_PAGE_SIZE)`; `nextCursor` from the last page row when `rows.length > LIBRARY_PAGE_SIZE` (else `null`).
  2. Load posts for `pageRows.map(r => r.postId)` with `include: { ...readyMedia, ...currentOffer, ...counts, creatorProfile: { select: { slug, userId, displayName, avatarKey } } }`; order them by the SQL order using a `Map` by id.
  3. `entries = await this.toPublicPosts(orderedRows, userId)` (adjust `publishedAt` handling as described above).
  4. Map to `{ ...post, creator: { slug, displayName, avatarUrl }, saved, purchased, addedAt: addedAt.toISOString() }` using the SQL row flags.
  5. `creators`: only when `q.cursor` is absent, from `libraryCreatorsSql`; otherwise `[]`.
- `apps/api/src/modules/posts/library.controller.ts`: `@Controller('me') @UseGuards(SessionGuard)`, `@Get('library') @Header('cache-control','no-store')`, `@Query(new ZodValidationPipe(libraryQuerySchema)) q`, `userId = req.authSession!.userId`. Register in `posts.module.ts`. Invalid enum values → 400 `VALIDATION_FAILED`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/modules/posts/public-posts.service.ts` | `library()`, archived-safe mapper |
| CREATE | `apps/api/src/modules/posts/library.controller.ts` | `GET /me/library` |
| MODIFY | `apps/api/src/modules/posts/posts.module.ts` | register controller |
| CREATE | `apps/api/src/modules/posts/library.integration.spec.ts` | integration tests |
| MODIFY | `.agile/guidelines/codebase-map.md` | endpoint row, rules |

**Testing** (Supertest/`inject`, real Postgres; use the existing test helpers for users, creators, posts, purchases):
- Isolation: user A and B each have items; A never receives B's; guest → 401.
- Saved-only, purchased-only and both (one row, `saved:true`, `purchased:true`); `relation=saved` includes the "both" row, `purchased` likewise.
- Saved premium (no purchase) → `access: 'locked'`, `previewUrl` only, no media refs in the JSON; purchased premium → `access: 'full'`.
- Availability: purchased + ARCHIVED listed (`access: 'full'`); purchased + REMOVED excluded; saved + ARCHIVED/DRAFT excluded; creator suspended (`PENDING_REVIEW` or user not ACTIVE) excluded; a subscription alone adds nothing.
- Filters: `creator` (case-insensitive), `media=image|video`, `sort=recent|oldest`; invalid `relation`/`media`/`sort`/cursor → 400.
- Pagination: with `LIBRARY_PAGE_SIZE + 3` items, pages are disjoint and complete; insert a newer save between page 1 and 2 → no repeat, no skip; `creators` is present on page 1 and `[]` on page 2; ties on `addedAt` ordered by id.
- `addedAt` is the later of the two timestamps.
- A schema-drift guard: the `PUBLIC_CREATOR` Prisma filter and the SQL agree (create creators in each non-public state and assert both exclude them).

---

### TASK-185: Swap the Koleksi Saya UI to the real API

- `apps/web/src/lib/api/library.ts`: replace the dummy body with a real call: build the query string from `LibraryQuery` (omit defaults and `creator === undefined`), `fetch('/api/v1/me/library?…', { credentials: 'include' })`, throw on `!res.ok`, parse with `libraryPageSchema`. Remove the dummy and the `fetchHomeFeedPage` import.
- `LibraryView` needs no change if TASK-173 followed the plan (that is the point of the single data function). Confirm creators dropdown, paging and filters work against the real response; fix only real mismatches.
- Update `library.test.ts` to mock `fetch` (query string building, error on non-OK, schema parse).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/lib/api/library.ts`, `library.test.ts` | real client |
| MODIFY | `apps/web/src/components/library/library-view.test.tsx` | only if the mock shape changed |
| MODIFY | `.agile/guidelines/codebase-map.md` | remove "dummy" note |

**Testing:** query-string contents for each filter; `403/401/500` throws; a full manual run: seed user with a saved, a bought and an archived-bought post shows tags Disimpan / Dibeli and opens the right sheet or viewer.

## Suggested order

TASK-183 → TASK-184 → TASK-185.
