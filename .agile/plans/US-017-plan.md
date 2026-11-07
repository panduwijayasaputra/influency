# Technical Plan: US-017 — Replies and Top Order API

## Architecture Overview

Extend the existing comments module (`apps/api/src/modules/engagement/post-comments.*`) instead of adding a new one.

- `post_comments` gets two columns: `parent_id` (nullable self-FK, one level deep) and a cached `like_count` (US-018 maintains it; this story only reads it).
- `GET /posts/:id/comments` changes from oldest-first to **Top order** (`like_count DESC, id DESC`; `id` is uuidv7, so `id DESC` = newest first). Each top-level item embeds its first `POST_COMMENT_REPLIES_PREVIEW` (3) live replies, oldest first, plus `replyCount`.
- New `GET /posts/:id/comments/:commentId/replies?cursor=` pages the remaining replies (oldest first, `id > cursor`).
- `POST /posts/:id/comments` accepts optional `parentId`. A reply to a reply is stored under that reply's top-level parent.
- Deleted top-level comment: returned as a placeholder only when it has ≥1 live reply, otherwise omitted. Deleted text is never selected.
- Every comment carries `canDelete`, `canEdit`, `canPin`. `canPin` is false on replies and placeholders.
- The Top order lives in one exported constant/helper (`TOP_ORDER` / `topCursorWhere`) so the formula is swappable. It is a documented placeholder (feature.md: formula OPEN), not final policy.
- The web "Balas" action sends `parentId`; "Lihat n balasan" loads more replies from the new endpoint.

Access rules are unchanged: every path goes through `gate()` (CMT-03/CMT-13), so reading and writing replies follows the same post access rule as comments.

## Dependencies

- **US-016 TASK-113 must land first.** It makes `canEdit`/`canPin` required in `postReplySchema` and changes `toComment` to `toComment(row, viewerId, ownerUserId)`. This plan builds on that signature. If TASK-113 is not done, do it first; do not duplicate it.
- No new packages.
- US-018 (likes) later increments/decrements `like_count` in the same transaction as the like row. Not part of this story.

## Risks

- **Cursor stability under Top order.** A like changing between page loads can move an item across the page boundary (duplicate or skipped item). Accepted for MVP; add a `shortcut:` comment. Mitigation: the keyset is `(like_count, id)`, so ties never skip.
- **Cursor format change.** `nextCursor` goes from a uuid to an opaque string `"<likeCount>_<id>"`. Every consumer of `postCommentListSchema.nextCursor` and the `?cursor=` validation must change together (TASK-116, TASK-118, TASK-120).
- **One-level rule is only enforced in the service**, not by a DB constraint. Mitigation: the service always resolves to the top-level id, and the tests cover reply-to-reply.
- **Prisma partial indexes are not supported**, so only plain indexes are used (see TASK-117).
- **Placeholder leaks.** A deleted parent must never expose `body`, `author` or avatar. The query must not select the body of deleted rows into the response; the mapper builds placeholders from `id`, `createdAt`, `replyCount`, `replies` only. A test asserts the deleted text does not appear anywhere in the JSON.

## Tasks

### TASK-116: Shared contracts (create-with-parent, replies page, opaque cursor, constants)

**What to build**

In `packages/shared/src/comments.ts`:

1. Constants:
   ```ts
   /** Replies embedded under each top-level comment in GET /posts/:id/comments. */
   export const POST_COMMENT_REPLIES_PREVIEW = 3;
   /** Page size of GET /posts/:id/comments/:commentId/replies. */
   export const POST_COMMENT_REPLIES_PAGE_SIZE = 20;
   ```
2. `createPostCommentSchema` gains `parentId: z.uuid().optional()`. Keep the body rules. `CreatePostCommentInput` follows.
3. `postCommentListSchema.nextCursor`: change `z.uuid().nullable()` to `z.string().nullable()` (opaque to clients). Update the doc comment: "Top order, then pass back as ?cursor=".
4. Add and export:
   ```ts
   export const postReplyListSchema = z.object({
     items: z.array(postReplySchema),
     nextCursor: z.uuid().nullable(), // last reply id; replies are oldest first
     canComment: z.boolean(),
   });
   export type PostReplyList = z.infer<typeof postReplyListSchema>;
   ```
5. Update the doc comments: the list is in Top order (placeholder formula: likes descending, then newest first); `deleted` placeholder has an empty `body` and `author.displayName: ''`.
6. Check `packages/shared/src/index.ts` re-exports `comments.ts` (it already does for existing symbols; add nothing unless a named export list is used).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/comments.ts` | constants, `parentId`, `nextCursor` string, `postReplyListSchema` |
| MODIFY | `packages/shared/src/comments.test.ts` | new cases |

**Testing:**
- `parentId` must be a uuid; a missing `parentId` parses; a bad one is rejected.
- A list with `nextCursor: '3_0190a000-...'` parses; `null` parses.
- `postReplyListSchema` parses a page and rejects a non-uuid cursor.
- Existing fixtures still parse. Rebuild shared (`pnpm --filter @influency/shared build`) before app tests.

---

### TASK-117: Migration — parent_id and like_count

**What to build**

1. `apps/api/prisma/schema.prisma`, model `PostComment`:
   ```prisma
   parentId  String?  @map("parent_id") @db.Uuid
   likeCount Int      @default(0) @map("like_count")
   parent    PostComment?  @relation("CommentReplies", fields: [parentId], references: [id], onDelete: Restrict)
   replies   PostComment[] @relation("CommentReplies")

   @@index([parentId, id])
   @@index([postId, likeCount(sort: Desc), id(sort: Desc)])
   ```
   Keep the existing indexes.
2. Create the migration with `pnpm db:migrate` (name `comment_replies_and_like_count`). Then append SQL to the generated migration file:
   ```sql
   ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_like_count_nonneg" CHECK ("like_count" >= 0);
   ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_parent_not_self" CHECK ("parent_id" IS NULL OR "parent_id" <> "id");
   ```
3. Run `pnpm --filter @influency/api generate`.
4. Check the Prisma-generated migration does not violate `src/common/schema-conventions.integration.spec.ts` (snake_case, uuid default, no float).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/prisma/schema.prisma` | columns, self-relation, indexes |
| CREATE | `apps/api/prisma/migrations/<ts>_comment_replies_and_like_count/migration.sql` | DDL + CHECKs |

**Testing:**
- `pnpm test` runs the migration through `global-setup.ts` and passes `schema-conventions.integration.spec.ts`.
- Add a case in the TASK-118 spec: inserting `like_count = -1` raw fails the CHECK.
- Existing comment tests still pass (new columns have defaults).

---

### TASK-118: Service — Top order list, placeholders, flags, reply creation

**What to build** in `apps/api/src/modules/engagement/post-comments.service.ts` (builds on TASK-113's `toComment(row, viewerId, ownerUserId)`).

1. **Top order in one place** (exported from the service file or a small `comment-order.ts` next to it):
   ```ts
   /** PLACEHOLDER (feature.md: formula OPEN). Likes descending, then newest first; id is uuidv7. */
   export const TOP_ORDER = [{ likeCount: 'desc' }, { id: 'desc' }] as const;
   export const encodeTopCursor = (r: { likeCount: number; id: string }) => `${r.likeCount}_${r.id}`;
   export function topCursorWhere(cursor: string) { /* parse /^(\d+)_([0-9a-f-]{36})$/ ; else throw DomainError('VALIDATION_FAILED') */
     return { OR: [{ likeCount: { lt: n } }, { likeCount: n, id: { lt: id } }] };
   }
   ```
   `shortcut:` comment: a like between pages can shift one item across a boundary; revisit with the final formula.
2. **`list(postId, userId, cursor?)`:**
   - `gate()` first (unchanged).
   - Query top-level rows: `where: { postId, parentId: null, OR: [{ deletedAt: null }, { replies: { some: { deletedAt: null } } }], ...(cursor && topCursorWhere(cursor)) }`, `orderBy: TOP_ORDER`, `take: PAGE_SIZE + 1`.
   - Select the shared `commentFields` plus `likeCount`, `deletedAt`, `_count: { select: { replies: { where: { deletedAt: null } } } }` and `replies: { where: { deletedAt: null }, orderBy: { id: 'asc' }, take: POST_COMMENT_REPLIES_PREVIEW, select: commentFields }`.
   - For a row with `deletedAt !== null`, do not read `body`/`user`: build a placeholder `{ id, createdAt, body: '', author: { displayName: '' }, deleted: true, likeCount: 0, canDelete: false, canEdit: false, canPin: false, replyCount, replies }`. Use Prisma `select` conditionally is awkward, so select the fields but never copy them; the mapper is the single place that decides (cover with the leak test).
   - `nextCursor = rows.length > PAGE_SIZE ? encodeTopCursor(page.at(-1)!) : null`.
   - Replies map with `canPin: false`, `canEdit`/`canDelete` from the viewer.
   - Top-level items: `replyCount = _count.replies`, `replies = mapped preview`.
3. **`create(postId, userId, input)`:**
   - `gate()` then the existing rate limit (shared with top-level comments).
   - If `input.parentId`: `findFirst({ where: { id: parentId, postId, deletedAt: null }, select: { id: true, parentId: true } })`. Missing / deleted / other post → `DomainError('NOT_FOUND')`. Then `const topId = parent.parentId ?? parent.id`.
   - Insert with `parentId: topId`. Return `toComment(row, userId, ownerUserId)` with `replies: []`, `replyCount: 0` for top-level and `canPin: false` for replies.
   - `shortcut:` a reply racing a delete of its parent can attach to a just-deleted parent; it is shown as a placeholder, acceptable.
4. `delete` is unchanged. (A deleted parent with live replies stays as a placeholder via the list query.)
5. A helper `mapReply(row, viewerId, ownerUserId)` for replies is shared by `list`, `listReplies` (TASK-119) and `create`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/modules/engagement/post-comments.service.ts` | list/create/mappers |
| CREATE | `apps/api/src/modules/engagement/comment-order.ts` | `TOP_ORDER`, cursor encode/decode |
| CREATE | `apps/api/src/modules/engagement/comment-order.spec.ts` | unit tests for the cursor |
| MODIFY | `apps/api/src/modules/engagement/post-comments.controller.ts` | `cursor` query: `z.string().regex(...).optional()` instead of `z.uuid()` |
| MODIFY | `apps/api/src/modules/engagement/post-comments.integration.spec.ts` | cases below |

**Testing:**
- Unit: cursor round-trip; malformed cursor → `VALIDATION_FAILED`.
- Integration (existing seeded users and posts; set `like_count` directly with raw SQL since US-018 is not built):
  - Order: likes 5 > likes 2 > likes 2 newer-first > likes 0; stable across pages (page size small via fixtures with > `POST_COMMENTS_PAGE_SIZE` rows, assert no duplicate or missing id over all pages).
  - Reply create: top-level parent → stored with `parentId`; reply to a reply → stored under the top-level parent; reply to a deleted comment → 404; to a missing id → 404; to a comment on another post → 404.
  - Placeholder: deleted parent with a live reply → `deleted: true`, empty body/author, text of the deleted body absent from the whole JSON string; deleted parent with no live replies → omitted; deleted parent whose only reply is deleted → omitted.
  - Flags: reply has `canPin: false` for the owner; the owner sees `canPin: true` on top-level only; author `canEdit`; anonymous all false.
  - Access: locked premium post → 403 for reading and replying (fan without access); owner OK; guest reads a free post, but POST → 401; policy flag cases mirror the existing comment tests.
  - Rate limit counts replies.
  - `replyCount` counts only live replies; preview holds at most 3, oldest first.
  - Raw insert `like_count = -1` violates the CHECK.

---

### TASK-119: Replies endpoint

**What to build**

1. Controller `post-comments.controller.ts`:
   ```ts
   @Get(':id/comments/:commentId/replies')
   @UseGuards(OptionalSessionGuard)
   @Header('cache-control', 'no-store')
   listReplies(@Param('id', ParseUUIDPipe) id, @Param('commentId', ParseUUIDPipe) commentId,
     @Query('cursor', new ZodValidationPipe(z.uuid().optional())) cursor, @Req() req): Promise<PostReplyList>
   ```
2. Service `listReplies(postId, commentId, userId, cursor?)`:
   - `gate()` with the read flag (same as `list`).
   - Parent must exist on this post with `parentId: null` (deleted allowed, since a placeholder parent still has replies); else `NOT_FOUND`.
   - `findMany({ where: { parentId: commentId, deletedAt: null, ...(cursor && { id: { gt: cursor } }) }, orderBy: { id: 'asc' }, take: POST_COMMENT_REPLIES_PAGE_SIZE + 1 })` → `{ items: mapReply(...), nextCursor: last id | null, canComment }` (same `canComment` rule as `list`).
   - The client resumes after the preview by passing the last shown reply id as `cursor`.
3. OpenAPI: follow how the existing routes are documented, if any decorators are used there; otherwise nothing extra.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/modules/engagement/post-comments.controller.ts` | route |
| MODIFY | `apps/api/src/modules/engagement/post-comments.service.ts` | `listReplies` |
| MODIFY | `apps/api/src/modules/engagement/post-comments.integration.spec.ts` | cases |

**Testing:**
- Pages of `POST_COMMENT_REPLIES_PAGE_SIZE` oldest first; cursor continues without duplicates; deleted replies are skipped.
- `commentId` that is a reply, or a comment of another post, or missing → 404.
- Deleted parent with live replies → replies returned (the parent itself is not in the response).
- Locked premium post: fan without access → 403; owner OK; anonymous on a free post OK, `canComment: false`.
- `cache-control: no-store`; no user ids in the JSON.

---

### TASK-120: Web — wire Balas, more replies, new cursor

**What to build** (the US-015 UI already renders `replies`, `replyCount`, `deleted`; this task only wires behaviour)

1. `apps/web/src/lib/api/post-comments.ts` (server fetch) — no change except types (cursor is now a string). Add a browser helper in the same folder, `comment-replies.ts`, mirroring `comment-likes.ts`: `fetchMoreReplies(postId, commentId, cursor): Promise<PostReplyList | null>` (never throws; parses with `postReplyListSchema`).
2. `components/comments/post-comments.tsx`:
   - State `replyTo: { topId: string; name: string } | null`. `CommentRowProps` gets `onReply(comment, topId)`. Replying to a reply passes the reply's top-level id (the server also normalizes).
   - `submit`: include `parentId` when `replyTo` is set. On success with `parentId`, insert the reply at the end of that thread's `replies` (and bump `replyCount`) instead of the end of `items`; reset `replyTo`. A "Membalas {name}" chip with a cancel button sits above the composer.
   - `loadMore` already uses `?cursor=${nextCursor}`: URL-encode the cursor (`encodeURIComponent`); the list now arrives in Top order, so the "new top-level comment goes to the end" logic changes: a new top-level comment has 0 likes and is the newest, so it belongs after all comments with ≥1 like and before older 0-like ones. Keep it simple: with `nextCursor === null`, prepend it **only if no loaded item has `likeCount > 0`**; otherwise insert after the last item with `likeCount > 0` (use the reducer in one small helper with a unit test); with more pages unloaded, keep the existing "sentNote" behaviour.
3. `components/comments/comment-item.tsx`: replace the `toast('Segera hadir')` on Balas with `onReply`. Focus moves to the composer textarea.
4. `components/comments/comment-thread.tsx`: when `open` and `replies.length < replyCount`, show "Lihat balasan lainnya" calling `fetchMoreReplies` with the last loaded reply id; append the result to the thread's replies (via a callback into `PostComments` state). On failure show the existing error text/toast.
5. Update fixtures that use `nextCursor` with a uuid (still valid strings). No change to guest behaviour: a guest's Balas stays a login link.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/lib/api/comment-replies.ts` (+ `.test.ts`) | more-replies helper |
| MODIFY | `apps/web/src/components/comments/post-comments.tsx` (+ `.test.tsx`) | `replyTo`, `parentId`, insert logic |
| MODIFY | `apps/web/src/components/comments/comment-item.tsx` | Balas wiring |
| MODIFY | `apps/web/src/components/comments/comment-thread.tsx` (+ `.test.tsx`) | "Lihat balasan lainnya" |

**Testing:**
- Vitest + Testing Library: Balas sets the chip and focuses the textarea; submit sends `parentId` (assert the fetch body); the reply appears under its thread and `replyCount` increments; cancel clears the chip; a reply to a reply sends the top-level id; guest sees a login link.
- Insert helper: new top-level placement with and without liked items.
- Load more replies: appends, stops when `nextCursor` is null, error keeps the existing replies.
- Cursor with `_` is passed URL-encoded on load more.
- `pnpm check` passes.
