# Technical Plan: US-059 — Post Media Order & 5-Item Limit API

## Architecture Overview

- **Limit.** The per-post limit is already enforced under the post-row lock (`PostMediaService` slot creation: `lockEditablePost` → count live items → `MEDIA_LIMIT_REACHED`). The constant `POST_MEDIA_MAX_PER_POST` in `packages/shared/src/post-media.ts` is **10**. Change it to **5** (design handoff business rule). Existing posts that already have more than 5 items keep them; only new slots are refused.
- **Order.** Add `media_assets.position INT NOT NULL`. A migration backfills it per post with `row_number() OVER (PARTITION BY post_id ORDER BY created_at, id) - 1`. New slots get `COALESCE(MAX(position), -1) + 1` among the post's rows, inside the same locked transaction.
  - There is deliberately no unique `(post_id, position)` index: a reorder rewrites every row and deletes leave gaps. Order is `position, created_at, id`.
- **Reorder endpoint.** `PUT /creators/me/posts/:postId/media/order { mediaIds: uuid[] }`. Under `lockEditablePost` (DRAFT only, else `POST_LOCKED`; foreign → 404), it loads the post's current non-deleted items (any status the studio list shows: READY, PROCESSING, REJECTED, plus unexpired PENDING_UPLOAD). `mediaIds` must be exactly that set (same size, no duplicates, no foreign ids), else `VALIDATION_FAILED`. It then sets `position = index` for each and returns the studio media list.
- **Read paths** switch from `createdAt` to `position` ordering everywhere media is listed.

## Dependencies

- None new.

## Risks

- **A read path missed** → inconsistent order between studio and public. Mitigation: grep every `mediaAsset.findMany` / `media_assets` query (`post-media.service.ts:210`, `public-posts.service.ts:41`, `media-access.service.ts:47`, feed/library/detail builders, raw SQL in `library-query.ts`/feed) and change them all; add one integration test per surface.

## Tasks

### TASK-207: Media position column, 5-item limit, ordered reads

- **Schema:** `MediaAsset.position Int` (`@map("position")`), plus `@@index([postId, position])`. Migration `media_position`: add the column nullable → backfill with the window function → `SET NOT NULL` → create the index.
- **`post-media.ts` (shared):** `POST_MEDIA_MAX_PER_POST = 5`; update tests and messages that mention 10.
- **`PostMediaService` slot creation:** inside the existing transaction after the limit check, `const { _max } = await tx.mediaAsset.aggregate({ where: { postId }, _max: { position: true } })` and create with `position: (_max.position ?? -1) + 1`.
- **Ordering:** replace `orderBy: { createdAt: 'asc' }` / `[{ createdAt: 'asc' }, { id: 'asc' }]` with `[{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]` in every media list (studio list, public posts, media-access, post detail, feed, library preview/thumbnail picks, and any raw SQL `ORDER BY`).
- **Seed:** if the seed creates media, set positions (0..n), and keep seeded posts ≤ 5 items.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/prisma/schema.prisma` (+ migration `media_position`) | Column + backfill + index |
| MODIFY | `packages/shared/src/post-media.ts` (+ test) | Limit 5 |
| MODIFY | `apps/api/src/modules/posts/post-media.service.ts` | Append position; order reads |
| MODIFY | `apps/api/src/modules/posts/public-posts.service.ts`, `apps/api/src/modules/entitlements/media-access.service.ts`, other media readers found by grep | Order by position |
| MODIFY | `apps/api/prisma/seed/*` | Positions |

**Testing** (integration):
- The 6th slot → 409 `MEDIA_LIMIT_REACHED` with `max: 5`.
- 6 concurrent slot requests on an empty post → exactly 5 succeed.
- New uploads get increasing positions.
- The migration backfill keeps the createdAt order (assert on seeded or created rows).
- Update existing specs that assumed 10.

---

### TASK-208: Reorder endpoint + web wiring

- **Shared (`post-media.ts`):** `reorderPostMediaSchema = z.object({ mediaIds: z.array(z.string().uuid()).min(1).max(POST_MEDIA_MAX_PER_POST * 2) }).strict()`. The max is a sanity bound; exact-set validation happens in the service.
- **Controller (`post-media.controller.ts`):** `@Put('order')`, declared before the `:mediaId` routes, `@Body(new ZodValidationPipe(reorderPostMediaSchema))` → `service.reorder(req.creatorProfileId, postId, body.mediaIds)` → `{ media: StudioMedia[] }`, `no-store`. The controller already has `ApprovedCreatorGuard`; CSRF is global.
- **`PostMediaService.reorder`:** `$transaction`: `lockEditablePost(tx, creatorProfileId, postId)`. Load the ids with the same visibility filter as the studio list. If the sets differ or there are duplicates → `DomainError('VALIDATION_FAILED', { issues: [{ path: 'mediaIds', message: 'Urutan media tidak sesuai.' }] })`. Then update positions in one statement (`UPDATE media_assets AS m SET position = v.pos FROM (SELECT unnest(${ids}::uuid[]) AS id, generate_series(0, n-1) AS pos) v WHERE m.id = v.id AND m.post_id = ${postId}::uuid`), then return the ordered list (reuse the list mapper).
- **Web:** replace the `saveMediaOrder` dummy in `lib/api/studio-posts.ts` with a `PUT` to the endpoint (throws `ApiError`). PostEditor (TASK-198) already calls it only for DRAFT posts with ≥ 2 items. Make sure it's skipped when the post is live.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/post-media.ts` (+ test) | Reorder schema |
| MODIFY | `apps/api/src/modules/posts/post-media.controller.ts`, `post-media.service.ts` | Endpoint + service |
| CREATE | `apps/api/src/modules/posts/post-media-order.integration.spec.ts` | Integration tests |
| MODIFY | `apps/web/src/lib/api/studio-posts.ts` (+ test) | Real `saveMediaOrder` |

**Testing** (integration):
- A reorder is reflected in the studio list, the public post, media-access and the feed for the same post (publish it after reordering).
- Missing id, extra id, duplicate, foreign post's media id → 400.
- Another creator's post → 404.
- A published post → 409 `POST_LOCKED`.
- Guest → 401; a non-creator → 403.
