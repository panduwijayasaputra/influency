# Technical Plan: US-018 — Comment Likes API

## Architecture Overview

The server side of the comment heart that US-015 already built in the UI. The web client (`setCommentLike`) and the shared response schema (`commentLikeResponseSchema` = `{ liked, likeCount }`) already exist, so this story is API-only plus the `liked` flag in list responses.

**Build US-017 first.** It adds `post_comments.like_count` (CHECK >= 0, indexed for Top order), `parent_id`, and the `mapReply` / `mapTop` mappers this plan extends. US-017 only reads `like_count`; this story is the only writer.

Decisions agreed with the user (2026-11-07):

- **Cached count in one transaction.** A new `comment_likes` table has `UNIQUE (comment_id, user_id)`. In one DB transaction:
  - like: insert with skip-duplicates, and increment `like_count` only when a row was really inserted
  - unlike: delete the row, and decrement only when a row was really deleted
  - The unique index makes the insert/delete result the single source of truth, so the count stays exact under concurrent taps with no row lock.
  - The response reports the updated `like_count`.
- **Access = the READ rule.** Liking uses the same gate as listing (`PREMIUM_COMMENTS_READ_WITHOUT_ACCESS`). A locked premium post returns 403 before the comment is looked up, so existence is never revealed.
- **Deleted comments:** like and unlike both return 404 `NOT_FOUND`. Replies under a deleted parent are live rows, so they can still be liked. Existing like rows on a deleted comment are kept (never edited).
- **Endpoints** (fixed by the US-015 plan, which the web client already calls):
  - `POST /api/v1/posts/:id/comments/:commentId/likes`
  - `DELETE /api/v1/posts/:id/comments/:commentId/likes`
  - Both return 200 `{ liked, likeCount }`, are idempotent, use `SessionGuard`, and are `no-store`. CSRF is checked by the global guard.

**Transaction boundary and idempotency (the financial-style checklist):**

- Boundary: `prisma.$transaction` around [live-comment check → like row insert/delete → `like_count` update → read count]. Default isolation (read committed) is enough.
- Idempotency key: the DB unique `(comment_id, user_id)`; no `Idempotency-Key` header is needed because this is non-financial and naturally idempotent.
- Concurrent double like: the second insert waits on the first's unique index entry, then skips. Only the winner sees `count === 1` and increments, so there is never a double increment.
- Like racing the comment's delete: the increment is `updateMany where { id, deletedAt: null }`. If it matches 0 rows, throw `NOT_FOUND`, which rolls back the like row too.

## Dependencies

- US-017 built and `done` (columns, mappers). No new packages.
- `pnpm --filter @influency/api generate` after the schema change, then `pnpm db:migrate`.

## Risks

- **`like_count` drifting from the like rows:** a bug in one path would skew Top order.
  - Mitigation: a single code path per direction, `CHECK like_count >= 0` (from US-017), and an integration test that compares `like_count` with `COUNT(*)` after a mixed concurrent run.
- **Existence leak on locked posts:** looking up the comment before the access gate would reveal it.
  - Mitigation: the gate runs first; a test asserts 403 for an existing and an unknown comment id on a locked premium post.
- **The heart already looks live in the UI** (`likeCount` is present once US-017 ships) but the endpoint does not exist yet.
  - Mitigation: ship US-018 right after US-017 (before UAT of the comment sheet).
- **Dropping the `gate` privacy:** `PostCommentsService.gate` becomes public so likes reuse it.
  - Mitigation: it already contains the whole rule; no behaviour change, and the existing comments specs cover it.

## Tasks

### TASK-121: comment_likes table (Prisma model + migration)

**What to build**

1. `apps/api/prisma/schema.prisma`: add
   ```prisma
   /// US-018: one like per (comment, user). Rows survive a soft delete of the comment and are never edited.
   model CommentLike {
     id        String      @id @default(dbgenerated("uuidv7()")) @db.Uuid
     commentId String      @map("comment_id") @db.Uuid
     userId    String      @map("user_id") @db.Uuid
     createdAt DateTime    @default(now()) @map("created_at") @db.Timestamptz(3)
     comment   PostComment @relation(fields: [commentId], references: [id], onDelete: Restrict)
     user      User        @relation("CommentLiker", fields: [userId], references: [id], onDelete: Restrict)

     @@unique([commentId, userId])
     @@index([userId])
     @@map("comment_likes")
   }
   ```
   Add the back-relations: `likes CommentLike[]` on `PostComment` and `commentLikes CommentLike[] @relation("CommentLiker")` on `User`.
2. `pnpm db:migrate --name comment_likes` and commit the generated migration. Check that the SQL has the unique index and RESTRICT foreign keys only.
3. Update the schema doc comment on `PostComment.likeCount` ("US-018 keeps it in sync inside the like transaction") if the wording is stale.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/prisma/schema.prisma` | `CommentLike` model + back-relations |
| CREATE | `apps/api/prisma/migrations/<ts>_comment_likes/migration.sql` | Generated migration |

**Testing:**

- Covered by TASK-122's integration spec (the unique constraint and the FK behaviour are asserted there). Run `pnpm test` to confirm `global-setup` migrates cleanly.

---

### TASK-122: Like / unlike endpoints (service, controller, integration tests)

**What to build**

1. `post-comments.service.ts`: make `gate` public (drop `private`) so the likes service reuses the access rule. No other change in this task.
2. **`apps/api/src/modules/engagement/comment-likes.service.ts`**:
   ```ts
   @Injectable()
   export class CommentLikesService {
     constructor(private readonly prisma: PrismaService, private readonly comments: PostCommentsService, @Inject(ENV) private readonly env: Env) {}
     like(postId: string, commentId: string, userId: string): Promise<CommentLikeResponse>
     unlike(postId: string, commentId: string, userId: string): Promise<CommentLikeResponse>
   }
   ```
   - Both start with `await this.comments.gate(postId, userId, this.env.PREMIUM_COMMENTS_READ_WITHOUT_ACCESS)` (hidden → `NOT_FOUND`, not published → `POST_NOT_AVAILABLE`, locked → `FORBIDDEN`). This runs **before** any comment lookup.
   - `like`, inside `prisma.$transaction(async (tx) => { ... })`:
     1. `tx.postComment.findFirst({ where: { id: commentId, postId, deletedAt: null }, select: { id: true } })`; missing → `DomainError('NOT_FOUND')` (this also covers a comment of another post and a deleted comment).
     2. `const { count } = await tx.commentLike.createMany({ data: [{ commentId, userId }], skipDuplicates: true })`.
     3. If `count === 1`: `const r = await tx.postComment.updateMany({ where: { id: commentId, deletedAt: null }, data: { likeCount: { increment: 1 } } })`; `r.count === 0` → throw `NOT_FOUND` (rolls back the like).
     4. Read `tx.postComment.findUniqueOrThrow({ where: { id: commentId }, select: { likeCount: true } })` and return `{ liked: true, likeCount }`.
   - `unlike`, same transaction shape:
     1. The same live-comment check (404 on a deleted comment, per the agreed rule).
     2. `const { count } = await tx.commentLike.deleteMany({ where: { commentId, userId } })`.
     3. If `count === 1`: `updateMany({ where: { id: commentId, likeCount: { gt: 0 } }, data: { likeCount: { decrement: 1 } } })`.
     4. Read the count; return `{ liked: false, likeCount }`.
   - Comment `// shortcut: no rate limit; a like is one cheap idempotent row. Add RateLimitGuard if abused.`
3. **`apps/api/src/modules/engagement/comment-likes.controller.ts`** (`@Controller('posts')`, `@UseGuards(SessionGuard)`):
   - `@Post(':id/comments/:commentId/likes') @HttpCode(200) @Header('cache-control', 'no-store')`
   - `@Delete(':id/comments/:commentId/likes') @HttpCode(200) @Header('cache-control', 'no-store')`
   - Both use `ParseUUIDPipe` on `id` and `commentId`, take `req.authSession!.userId`, and return the service result. Follow `post-likes.controller.ts`.
4. Register both in `engagement.module.ts` (`controllers`, `providers`).
5. **`apps/api/src/modules/engagement/comment-likes.integration.spec.ts`**: use the next free fixed id range (grep `0190a000-0000-7000-8000-0000002` first; `29` and `2a` are taken, expect `2b`) and follow the setup of `post-comment-replies.integration.spec.ts`. Seed: a creator, fans A/B/C, a FREE published post, a premium post that fans cannot access, an archived post, and comments (top-level, a reply, a deleted parent that still has a live reply, a deleted comment).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/modules/engagement/post-comments.service.ts` | `gate` public |
| CREATE | `apps/api/src/modules/engagement/comment-likes.service.ts` | like / unlike in one tx |
| CREATE | `apps/api/src/modules/engagement/comment-likes.controller.ts` | POST / DELETE `/posts/:id/comments/:commentId/likes` |
| MODIFY | `apps/api/src/modules/engagement/engagement.module.ts` | Register |
| CREATE | `apps/api/src/modules/engagement/comment-likes.integration.spec.ts` | Rules below |

**Testing** (Fastify `inject` against real Postgres, like the sibling specs):

- Like returns 200 `{ liked: true, likeCount: 1 }`; a second like by the same user is 200 and the count stays 1 (idempotent); unlike returns `{ liked: false, likeCount: 0 }`; a second unlike is 200 and the count stays 0 (never negative).
- Two different users liking give `likeCount` 2; the response is `commentLikeResponseSchema`-valid; `cache-control: no-store`.
- Likes work on a reply, and on a reply under a **deleted** parent.
- Like and unlike on a **deleted** comment → 404; the old like rows are untouched.
- A comment id from a different post → 404; an unknown id → 404; a malformed id → 400.
- Guest (no cookie) → 401; a request without a matching `Origin` → 403 (CSRF).
- Locked premium post: 403 for an existing comment **and** for an unknown comment id (same response, no existence leak). With `PREMIUM_COMMENTS_READ_WITHOUT_ACCESS` on (test app with the flag), a locked-post like succeeds.
- Archived/unpublished post → `POST_NOT_AVAILABLE`; hidden post → 404.
- **Concurrency:** 20 parallel `POST` likes by the same user → exactly one `comment_likes` row and `like_count = 1`; 10 different users liking in parallel → `like_count = 10`; a mixed parallel like/unlike run ends with `post_comments.like_count` equal to `COUNT(*)` of `comment_likes` for that comment.
- A like racing the delete of the same comment: the result is either (liked and the comment still live) or (404 with no `comment_likes` row left); never a like row on a deleted comment from this path.
- DB: inserting a duplicate `(comment_id, user_id)` directly violates the unique constraint.

---

### TASK-123: Return `liked` for the viewer in comment responses

**What to build**

Fill the optional `liked` field (already in `postReplySchema`) so the heart shows the viewer's own state after a page load. In `post-comments.service.ts`:

1. Add a private helper
   ```ts
   private async likedIds(userId: string | null, commentIds: string[]): Promise<Set<string>>
   ```
   Returns an empty set for an anonymous viewer or an empty list; otherwise one query: `commentLike.findMany({ where: { userId, commentId: { in: commentIds } }, select: { commentId: true } })`. One query per list call (no N+1).
2. Change `mapReply` and `mapTop` to take a `liked: ReadonlySet<string>` argument and set `liked: liked.has(row.id)`. The deleted placeholder always has `liked: false` (like count 0, as today).
3. `list`: collect the ids of the page's top-level comments **and** their preview replies, call `likedIds` once, and pass the set down. `listReplies`: ids of the page. `create`: a new comment is never liked yet, so pass an empty set.
4. Do not change ordering or the cursor: Top order still uses the stored `like_count`, so a like moves a comment on the next load, not live (the UI does not re-sort).
5. Web: no code change is expected (`CommentLikeButton` already reads `liked` and `likeCount` and calls the endpoint). Confirm by running the comment web tests, and update the `comment-likes.ts` doc comment ("endpoint built by US-018") to say the endpoint exists.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/modules/engagement/post-comments.service.ts` | `likedIds`, `liked` in mappers |
| MODIFY | `apps/api/src/modules/engagement/post-comments.integration.spec.ts` | `liked` cases |
| MODIFY | `apps/api/src/modules/engagement/post-comment-replies.integration.spec.ts` | `liked` on replies |
| MODIFY | `apps/web/src/lib/api/comment-likes.ts` | Doc comment only |

**Testing:**

- Fan A likes a comment and a reply, then lists: those items have `liked: true`, others `false`; fan B sees `likeCount` including A's like but `liked: false`.
- Anonymous list: every `liked` is `false`, counts present.
- Replies endpoint (`listReplies`) returns the viewer's `liked` per reply.
- A deleted placeholder is `liked: false`, `likeCount: 0`, even if the viewer once liked it.
- A new comment from `create` has `liked: false`, `likeCount: 0`.
- Query count: listing 50 comments with replies runs one extra query for likes, not one per comment (assert via a Prisma query counter if the sibling specs have one; otherwise assert correctness only).
- `pnpm check` passes, including the existing web comment tests.
