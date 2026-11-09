# Technical Plan: US-020 — Pin Comment API

## Architecture Overview

One pinned top-level comment per post, set by the post's creator, shown first in the list, and cleared automatically when that comment is deleted. The UI already has everything except the call: the `Sematkan / Lepas sematan` menu item, the `canPin` flag, the `pinned` field and the "Disematkan oleh creator" label (US-015, US-016).

Decisions agreed with the user (2026-11-07):

- **Storage = `post_comments.pinned_at` + a partial unique index.**
  - Nullable `pinned_at timestamptz`. A raw-SQL unique index `ON post_comments (post_id) WHERE pinned_at IS NOT NULL` makes a second pin on a post impossible at the database level (CMT-14).
  - A CHECK (`pinned_at IS NULL OR parent_id IS NULL`) keeps replies out of pinning at the database level.
  - Prisma cannot model partial indexes, so both are raw SQL in the migration (the project already does this for CHECKs). Add a comment in `schema.prisma` pointing at them.
- **Endpoints:** `PUT /api/v1/posts/:id/comments/:commentId/pin` and `DELETE …/pin`. Both are idempotent, `no-store`, return 200 `{ pinned: boolean }`, and use `SessionGuard`; CSRF is the global guard.
- **Rules, in this order:**
  1. Guest → 401.
  2. `access.check` hidden → 404 `NOT_FOUND`; post not `PUBLISHED` → `POST_NOT_AVAILABLE`.
  3. Caller is not the post's creator → 403 `FORBIDDEN`. This runs **before** the comment lookup, so non-owners learn nothing about a comment's existence. Admins get no pin right (UX spec §7.8: only the post's creator).
  4. Comment missing, deleted, or on another post → 404 `NOT_FOUND`.
  5. Comment is a reply → 422 new code `COMMENT_NOT_PINNABLE`.
- **Atomic replace:** one `$transaction` that first locks the post row (`lockAnyPost`, `SELECT … FOR UPDATE`), then clears any other pin on the post, then pins the target. The lock serializes concurrent pins; the unique index is the backstop. Pinning an already pinned comment changes nothing (idempotent).
- **Delete clears the pin in the same statement.** `PostCommentsService.delete` adds `pinnedAt: null` to its existing `updateMany` data, so a deleted comment is never left pinned (CMT-12) and US-021's admin delete can reuse it.
- **Delete racing pin:** the pin write is a conditional `updateMany` with `deletedAt: null`; it waits on a concurrent delete's row lock and then matches nothing, which throws `NOT_FOUND` and rolls the whole replace back.
- **List order:**
  - First page (no cursor): the pinned comment (live, `pinned_at` not null) comes first, then Top order for the rest. The rest take `PAGE_SIZE - 1` items so the page stays at 50.
  - Every page excludes the pinned comment from the Top query (`pinned_at IS NULL`), so it never appears twice and the keyset cursor is unaffected.
  - The cursor is still `<likeCount>_<id>` of the last non-pinned item.
- **Web:** `PostComments` gets a `pin(id, pin)` handler (PUT / DELETE, inline error on failure, toast on success). Local state: pinning sets `pinned: true` on the target, `false` on all others, and moves the target to the top; unpinning only clears `pinned` (the list re-sorts on the next load).

## Dependencies

- US-016 (menu, `canPin`), US-017 (`mapTop`, Top order) done. US-018 (likes) and US-019 (edit) also edit `post-comments.service.ts`, `post-comments.tsx` and `comment-item.tsx`. Changes here are additive; whichever story lands later merges, never overwrites.
- Rebuild shared after TASK-131 (`pnpm --filter @influency/shared build`); `pnpm --filter @influency/api generate` after the schema change.
- No new packages.

## Risks

- **Two creators' pins or two tabs racing:** serialized by the post-row lock; the partial unique index guarantees at most one pin even if the lock is ever bypassed. A test fires parallel pins.
- **Pin racing delete:** the conditional write and rollback described above; a test runs both together and asserts no pinned deleted row remains.
- **Cursor and page size:** the pinned item on the first page shrinks the rest to 49. A test with 60 comments checks page sizes (50, then the remaining 10), no duplicate pinned item, and that the cursor still walks every comment once.
- **Merge conflicts with US-018/US-019** in the same files (see Dependencies).
- **Pin is not access-gated by entitlement** because only the creator can pin; a locked-premium viewer never sees comments at all (existing gate).

## Tasks

### TASK-127: pinned_at column, partial unique index, shared schema, delete clears the pin

**What to build**

1. `apps/api/prisma/schema.prisma`, model `PostComment`: add
   ```prisma
   /// US-020: set while the comment is the post's pinned comment. At most one per post (partial unique index
   /// post_comments_one_pinned_per_post) and top-level only (CHECK post_comments_pinned_top_level), both raw SQL in the migration.
   pinnedAt DateTime? @map("pinned_at") @db.Timestamptz(3)
   ```
   Run `pnpm db:migrate --name comment_pinned_at`, then append to the generated `migration.sql`:
   ```sql
   -- US-020: one pinned comment per post, top-level only.
   CREATE UNIQUE INDEX "post_comments_one_pinned_per_post" ON "post_comments"("post_id") WHERE "pinned_at" IS NOT NULL;
   ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_pinned_top_level" CHECK ("pinned_at" IS NULL OR "parent_id" IS NULL);
   ```
   Check that `prisma migrate dev` reports no drift afterwards (a second `pnpm db:migrate` must create nothing). Then `pnpm --filter @influency/api generate`.
2. `packages/shared/src/errors.ts`: add `COMMENT_NOT_PINNABLE: { status: 422, message: 'Balasan tidak bisa disematkan.' }`.
3. `packages/shared/src/comments.ts`:
   ```ts
   /** Response of PUT and DELETE /posts/:id/comments/:commentId/pin (US-020); both are idempotent. */
   export const commentPinResponseSchema = z.object({ pinned: z.boolean() });
   export type CommentPinResponse = z.infer<typeof commentPinResponseSchema>;
   ```
   Update the doc comment of `postCommentSchema.pinned` ("true on the post's pinned comment; only on a top-level comment"). Rebuild shared.
4. `post-comments.service.ts`:
   - Add `pinnedAt: true` to `topFields` (not to reply fields) and to the `TopRow` type. `mapTop`: live rows get `pinned: row.pinnedAt !== null`; the deleted placeholder keeps `pinned: false`; `create()` passes `pinnedAt: null` in its synthetic row.
   - `delete()`: change the `updateMany` data to `{ deletedAt: new Date(), deletedByUserId: userId, pinnedAt: null }` and extend the comment above it ("deleting clears the pin in the same statement, CMT-12").

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/prisma/schema.prisma` | `pinnedAt` |
| CREATE | `apps/api/prisma/migrations/<ts>_comment_pinned_at/migration.sql` | column + partial unique index + CHECK |
| MODIFY | `packages/shared/src/errors.ts` | `COMMENT_NOT_PINNABLE` |
| MODIFY | `packages/shared/src/comments.ts` | `commentPinResponseSchema` |
| MODIFY | `packages/shared/src/comments.test.ts` | New schema cases |
| MODIFY | `apps/api/src/modules/engagement/post-comments.service.ts` | `pinned` in the mapper; delete clears the pin |

**Testing:**

- Shared: `commentPinResponseSchema` parses `{ pinned: true }` and rejects a missing or non-boolean field; the error code exists with status 422.
- API integration (new `post-comment-pin.integration.spec.ts`, started in TASK-128; for this task add the database cases there): inserting a second pinned comment on the same post violates the unique index (P2002 / 23505); two pinned comments on different posts are fine; pinning a reply by raw SQL violates the CHECK.
- Deleting a pinned comment (existing delete endpoint) leaves `pinned_at` null in the DB, and the list no longer shows a pin.
- The existing comments, replies and likes specs still pass.

---

### TASK-128: Pin / unpin endpoints (service, controller, integration tests)

**What to build**

1. **`apps/api/src/modules/engagement/comment-pins.service.ts`**:
   ```ts
   @Injectable()
   export class CommentPinsService {
     constructor(private readonly prisma: PrismaService, private readonly access: PostAccessService) {}
     pin(postId: string, commentId: string, userId: string): Promise<CommentPinResponse>
     unpin(postId: string, commentId: string, userId: string): Promise<CommentPinResponse>
   }
   ```
   - Shared pre-check `private async assertOwner(postId, userId)`: `access.check(postId, userId)` hidden → `NOT_FOUND`; load `post.status` and `creatorProfile.userId`; status not `PUBLISHED` → `POST_NOT_AVAILABLE`; `creatorProfile.userId !== userId` → `FORBIDDEN`. This runs before any comment query.
   - `pin`, in `prisma.$transaction(async (tx) => { ... })`:
     1. `await lockAnyPost(tx, postId)` (from `../posts/posts.service.js`).
     2. `const c = await tx.postComment.findFirst({ where: { id: commentId, postId, deletedAt: null }, select: { parentId: true } })`; missing → `NOT_FOUND`; `c.parentId !== null` → `COMMENT_NOT_PINNABLE`.
     3. `tx.postComment.updateMany({ where: { postId, pinnedAt: { not: null }, id: { not: commentId } }, data: { pinnedAt: null } })`.
     4. `tx.postComment.updateMany({ where: { id: commentId, deletedAt: null, pinnedAt: null }, data: { pinnedAt: new Date() } })`.
     5. Re-read `{ pinnedAt, deletedAt }` of the target; `deletedAt !== null` or `pinnedAt === null` → throw `NOT_FOUND` (a delete won the race; the whole transaction rolls back, including step 3). Return `{ pinned: true }`.
   - `unpin`, same transaction shape: lock the post; the same live-comment lookup (404; a reply is simply not pinned, so no 422 needed, just fall through); `updateMany({ where: { id: commentId, pinnedAt: { not: null } }, data: { pinnedAt: null } })`; return `{ pinned: false }` (idempotent when not pinned).
   - Add `// shortcut: no rate limit; pins are creator-only and idempotent.`
2. **`comment-pins.controller.ts`** (`@Controller('posts')`, `@UseGuards(SessionGuard)`): `@Put(':id/comments/:commentId/pin')` and `@Delete(':id/comments/:commentId/pin')`, both `@HttpCode(200)`, `@Header('cache-control', 'no-store')`, `ParseUUIDPipe` on both params, `req.authSession!.userId`. Follow `comment-likes.controller.ts`.
3. Register both in `engagement.module.ts`.
4. **`post-comment-pin.integration.spec.ts`**: new fixed id range. Grep `0190a000-0000-7000-8000-0000002` for taken ones (`29`, `2a`, `2b` are used by the comments specs); take the next free one. Follow the setup of `comment-likes.integration.spec.ts`. Seed: a creator, fans A/B, a second creator, a FREE post, another post of the creator, another creator's post, and comments (several top-level, a reply, a deleted one).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/engagement/comment-pins.service.ts` | pin / unpin in one tx under the post lock |
| CREATE | `apps/api/src/modules/engagement/comment-pins.controller.ts` | PUT / DELETE `/posts/:id/comments/:commentId/pin` |
| MODIFY | `apps/api/src/modules/engagement/engagement.module.ts` | Register |
| CREATE | `apps/api/src/modules/engagement/post-comment-pin.integration.spec.ts` | Rules below |

**Testing** (Fastify `inject`, real Postgres):

- The creator pins: 200 `{ pinned: true }`, `pinned_at` set. Pinning again: 200 and `pinned_at` unchanged. Unpin: 200 `{ pinned: false }`; unpin again: 200.
- Pinning B while A is pinned: A is cleared and B is pinned in one step; exactly one pinned row on the post (CMT-10, CMT-14).
- A fan (author of the comment) → 403; another creator → 403; an admin who is not the creator → 403; none of these change the DB. A non-owner asking about an unknown comment id also gets 403 (no existence leak).
- Guest → 401; missing `Origin` → 403; malformed ids → 400.
- A reply → 422 `COMMENT_NOT_PINNABLE`; a deleted comment, an unknown id and another post's comment → 404; unpinning a deleted/unknown comment → 404.
- Archived or draft post → `POST_NOT_AVAILABLE` / 404; a hidden post → 404.
- **Concurrency:** 10 parallel pins of 10 different comments on one post → exactly one pinned row afterwards and every response 200; 20 parallel pins of the same comment → one row, all 200; a mixed parallel pin/unpin run never leaves more than one pinned row.
- **Delete racing pin:** run pin and the owner's delete of the same comment together; afterwards no row is both deleted and pinned, and the response is 200 (then deleted → pin cleared) or 404.
- Pins on two different posts are independent.

---

### TASK-129: Pinned comment first in the list

**What to build**

In `post-comments.service.ts` `list()`:

1. Add `pinnedAt: null` to the main query's `where` (so the pinned comment never repeats on any page). Keep `OR`/`AND` structure intact.
2. When there is **no cursor**, load the pinned comment first:
   ```ts
   const pinned = cursor ? null : await this.prisma.postComment.findFirst({
     where: { postId, parentId: null, deletedAt: null, pinnedAt: { not: null } },
     select: topFields,
   });
   ```
   Then `const size = POST_COMMENTS_PAGE_SIZE - (pinned ? 1 : 0)`; the main query takes `size + 1`, the page is `rows.slice(0, size)`, and `nextCursor` is `encodeTopCursor(page.at(-1)!)` only when `rows.length > size` (so it never points at the pinned row).
3. `items = [...(pinned ? [pinned] : []), ...page]` mapped with `mapTop`; the pinned row's `liked` comes from the same `likedIds` call if US-018 is merged (include its id and its preview replies' ids).
4. Do not change `listReplies`. Do not add an order toggle.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/modules/engagement/post-comments.service.ts` | pinned first, no duplicate |
| MODIFY | `apps/api/src/modules/engagement/post-comment-pin.integration.spec.ts` | List cases |

**Testing:**

- A pinned low-liked comment appears first (index 0) with `pinned: true`; the others follow in Top order; it appears exactly once.
- With 60 comments and a pin: page one has 50 items (pinned + 49), page two has 10, and the union of both pages holds every live comment exactly once; the pinned comment is absent from page two.
- With no pin the page sizes are unchanged (50 + rest).
- After unpin or after deleting the pinned comment it returns to its Top position or disappears; a pinned comment with replies keeps its `replyCount` and preview replies.
- Only the pinned comment has `pinned: true`; its `canPin` is still true for the creator only.
- A guest sees the pin first too (it is public data); a locked premium post still returns 403 (existing gate).

---

### TASK-130: Wire the sheet's Sematkan / Lepas sematan action

**What to build**

1. `apps/web/src/components/comments/post-comments.tsx`:
   - Add a pure `applyPin(list: PostComment[], id: string, pin: boolean): PostComment[]` next to `removeComment`: pinning returns the target with `pinned: true` first, followed by the others with `pinned: false` (original order kept); unpinning sets `pinned: false` on the target and leaves the order.
   - Add `const pin = (id: string, next: boolean) => run(async () => { const res = await fetch(`${base}/${id}/pin`, { method: next ? 'PUT' : 'DELETE' }); if (!res.ok) return res; setItems((list) => applyPin(list, id, next)); toast(next ? 'Komentar disematkan' : 'Sematan dilepas'); return null; })`. Failures use the existing `run()` inline error (the API message, e.g. the 403 / 404 text). Use `useToast()` here if it is not already imported.
   - Pass `onPin={pin}` into `CommentThread`.
2. `comment-item.tsx` / `comment-thread.tsx`: add `onPin: (id: string, pin: boolean) => void` to `CommentRowProps`, and replace `onPin={() => toast('Segera hadir')}` with `onPin={() => onPin(comment.id, !pinned)}`. Keep the `toast` for any other use (editor Simpan is wired by US-019).
3. Update the doc comments that say pin is "Segera hadir until US-020".

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/components/comments/post-comments.tsx` | `applyPin`, `pin` handler |
| MODIFY | `apps/web/src/components/comments/comment-item.tsx` | `onPin` prop |
| MODIFY | `apps/web/src/components/comments/comment-thread.tsx` | Pass `onPin` through |
| MODIFY | `apps/web/src/components/comments/post-comments.test.tsx` | Pin cases |
| MODIFY | `apps/web/src/components/comments/comment-thread.test.tsx` | Menu → `onPin` call |

**Testing** (Vitest + Testing Library, `{ wrapper: Toaster }`):

- Creator opens `···` → Sematkan: a `PUT /api/v1/posts/{id}/comments/{commentId}/pin` request is sent; the comment moves to the top, shows "Disematkan oleh creator", the menu now says "Lepas sematan", and the toast "Komentar disematkan" shows.
- Pinning a second comment unpins the first (only one label in the DOM).
- Lepas sematan sends `DELETE`, removes the label and shows "Sematan dilepas".
- A failed request (403 / 500) leaves the list unchanged and shows the inline error.
- The Sematkan item is hidden for a viewer without `canPin` and for replies (existing behaviour, keep a regression assertion).
- `applyPin` unit cases: pin moves to front and clears others; unpin keeps order; unknown id changes nothing.
- `pnpm check` passes.
