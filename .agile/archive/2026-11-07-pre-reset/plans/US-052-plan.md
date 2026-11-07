# Technical Plan: US-052 — Comment on a Post

## Architecture Overview

Comments are rows in a new `post_comments` table, part of the `engagement` module that US-051 creates. Comments are text only, and both the API and a DB CHECK enforce the maximum length. The web renders comment text as a React text node, so it is never treated as HTML.

These decisions were agreed with the user:

- **Soft delete.** `deleted_at` + `deleted_by_user_id`. Every read filters `deleted_at IS NULL`, so a deleted comment disappears for everyone. The row stays for later moderation and audit (US-042 / US-043). A deleted comment answers 404, as if it never existed.
- **Oldest first, 50 per page.** Cursor pagination on the uuidv7 `id` (`id > cursor ORDER BY id ASC LIMIT 51`). `nextCursor` is the last id of the page, or null when no further rows exist.
- **Simple DB rate limit.** A user may create at most `COMMENT_RATE_LIMIT_PER_MINUTE` comments (env, placeholder 10) in the last 60 s. Otherwise the API returns 429 `RATE_LIMITED`. Deleted comments count too, so deleting a comment does not free up quota.
- **Max length 500** (`POST_COMMENT_MAX_LENGTH`, a [TBD] placeholder in shared + a DB CHECK).
- **[TBD] policy placeholders** (Monetization Spec v1 §2, engagement rules OPEN): the env flags `PREMIUM_COMMENTS_READ_WITHOUT_ACCESS` and `PREMIUM_COMMENTS_WRITE_WITHOUT_ACCESS`, both defaulting to `false` ("only viewers with access").
- **One engagement rule** shared with likes (US-051's `canLike`, renamed `canEngage`), evaluated server-side for the session user (or anonymous):
  1. `PostAccessService.check(postId, userId)` returns `hidden` → 404 `NOT_FOUND`.
  2. The post is not `PUBLISHED` → 404 `POST_NOT_AVAILABLE`. Archived and removed posts show no comments and reject new ones, even for the owner.
  3. Access is `locked` and the relevant flag is false → 403 `FORBIDDEN`.
  4. Otherwise the request is allowed. Anonymous visitors may **read** the comments of free posts. Writing needs a session.
- **Delete rule** (it does not require `PUBLISHED`, so an owner can still clean up an archived post): access must not be `hidden`, the comment must exist on that post and not already be deleted, and the caller must be the comment's author **or** the post owner (`creatorProfile.userId`). Anyone else → 403 `FORBIDDEN`.
- **Out of scope:** reporting comments (US-042), admin delete, editing, replies/threads, comment counts on feed cards.

| AC | Covered by |
|----|------------|
| A logged-in user can comment on a published free post; text only, configured max length | `POST /posts/:id/comments`, `createPostCommentSchema` (trim, 1..500) + DB CHECK |
| Premium comment read/write rules are configurable, default "only viewers with access" | `PREMIUM_COMMENTS_READ/WRITE_WITHOUT_ACCESS`, rule step 3; tests with the flags both ways |
| The author deletes their own comment; the creator deletes any comment on their posts; deleted comments vanish for everyone | `DELETE /posts/:id/comments/:commentId` + delete rule; soft delete filtered from every read |
| Archived/removed posts: comments not shown publicly, new comments rejected | rule steps 1–2 on GET and POST |
| Rendered as plain text | React text node + `whitespace-pre-wrap`; no `dangerouslySetInnerHTML`; web test with `<script>` text |

## Dependencies

- US-051 (done) provides `apps/api/src/modules/engagement/` and the pure `canLike` rule. TASK-085 reuses both.
- No new packages.

## Risks

- **The rate limit is not atomic.** Concurrent POSTs can overshoot N by a few, because count + insert is not serialized. That is acceptable for a spam brake. Add a comment: `// shortcut: count-then-insert can overshoot under concurrency; move to Redis/advisory lock if abused.`
- **Length units differ.** JS `.length` counts UTF-16 units and PG `char_length` counts code points, so JS is stricter (an emoji counts 2) and the CHECK can never fire on input that zod accepted. Accepted.
- **A comment can race an archive.** A comment can commit right after the post is archived, because there is no post-row lock. It is invisible (the post is not PUBLISHED) and non-financial, so it is accepted with a `shortcut:` comment, as for likes.
- **Spam and abuse** beyond the rate limit (links, offensive text) wait for US-042 reporting and moderation.

## Tasks

### TASK-084: Post comments — table, env flags and shared contract

**Prisma** (`apps/api/prisma/schema.prisma`), a new model after `PostLike`:

```prisma
/// US-052: plain-text comment. Soft-deleted only (deleted_at); every read filters deleted_at IS NULL.
/// CHECK post_comments_body_length (migration): char_length(body) BETWEEN 1 AND 500 (POST_COMMENT_MAX_LENGTH).
model PostComment {
  id              String    @id @default(dbgenerated("uuidv7()")) @db.Uuid
  postId          String    @map("post_id") @db.Uuid
  userId          String    @map("user_id") @db.Uuid
  body            String
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  deletedAt       DateTime? @map("deleted_at") @db.Timestamptz(3)
  deletedByUserId String?   @map("deleted_by_user_id") @db.Uuid
  post            Post      @relation(fields: [postId], references: [id], onDelete: Restrict)
  user            User      @relation("PostCommentAuthor", fields: [userId], references: [id], onDelete: Restrict)
  deletedBy       User?     @relation("PostCommentDeleter", fields: [deletedByUserId], references: [id], onDelete: Restrict)

  @@index([postId, id])
  @@index([userId, createdAt])
  @@index([deletedByUserId])
  @@map("post_comments")
}
```

Add `comments PostComment[]` to `Post`. Add `postComments PostComment[] @relation("PostCommentAuthor")` and `deletedPostComments PostComment[] @relation("PostCommentDeleter")` to `User`. Create the migration with `pnpm db:migrate --create-only` (name it `post_comments`) and append the following to the generated SQL:

```sql
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_body_length" CHECK (char_length("body") BETWEEN 1 AND 500);
-- deleted_at and deleted_by_user_id are set together
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_deleted_consistent" CHECK (("deleted_at" IS NULL) = ("deleted_by_user_id" IS NULL));
```

Then apply it (`pnpm db:migrate`) and run `pnpm --filter @influency/api generate`. `schema-conventions.integration.spec.ts` must still pass (it checks that every FK has an index).

**Env** (`apps/api/src/common/env.ts`): add the following after `PREMIUM_LIKES_WITHOUT_ACCESS`, using the same enum/transform pattern:

```ts
// TBD placeholders (Monetization Spec v1 §2, engagement rules OPEN): when true, logged-in users may read / write
// comments on a premium post they have not unlocked. Default: only viewers with access.
PREMIUM_COMMENTS_READ_WITHOUT_ACCESS: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
PREMIUM_COMMENTS_WRITE_WITHOUT_ACCESS: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
// TBD placeholder: comments one user may create per rolling minute (spam brake).
COMMENT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(10),
```

Add all three to `.env.example` with `# Placeholder (TBD): …` comments like their neighbours. Extend `env.spec.ts`: the defaults, `'true'` → true, invalid values rejected, and `COMMENT_RATE_LIMIT_PER_MINUTE=0` rejected.

**Shared** (`packages/shared/src/comments.ts`, new; re-export it from `index.ts`):

```ts
/** TBD placeholder (agreed default 500). Mirrored by the post_comments_body_length CHECK. */
export const POST_COMMENT_MAX_LENGTH = 500;
export const POST_COMMENTS_PAGE_SIZE = 50;

export const createPostCommentSchema = z.object({
  body: z.string().trim().min(1).max(POST_COMMENT_MAX_LENGTH),
});
export type CreatePostCommentInput = z.infer<typeof createPostCommentSchema>;

export const postCommentSchema = z.object({
  id: z.uuid(),
  body: z.string(),
  createdAt: z.iso.datetime(),
  author: z.object({ displayName: z.string() }),
  /** Server-side delete rule for the current viewer (author or post owner). */
  canDelete: z.boolean(),
});
export type PostComment = z.infer<typeof postCommentSchema>;

export const postCommentListSchema = z.object({
  items: z.array(postCommentSchema),
  nextCursor: z.uuid().nullable(),
  /** Server-side write rule for the current viewer; false for anonymous. */
  canComment: z.boolean(),
});
export type PostCommentList = z.infer<typeof postCommentListSchema>;
```

Match how `posts.ts` writes dates (`z.iso.datetime()` or the house equivalent) and use the existing zod style.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/prisma/schema.prisma` | `PostComment` model + relations |
| CREATE | `apps/api/prisma/migrations/<ts>_post_comments/migration.sql` | generated + 2 CHECKs |
| MODIFY | `apps/api/src/common/env.ts`, `env.spec.ts`, `.env.example` | 3 new vars |
| CREATE | `packages/shared/src/comments.ts`, `comments.test.ts` | contract |
| MODIFY | `packages/shared/src/index.ts` | export `comments.js` |

**Testing:**
- `comments.test.ts`: `'  hi  '` → `'hi'`. A body that is only whitespace is rejected, 500 chars are accepted and 501 rejected. The list schema parses a sample page with a null `nextCursor`.
- `env.spec.ts`: defaults and parsing for the three vars.
- The migration applies, and a raw `INSERT` with a 501-char body or an empty body fails the CHECK. Put that assertion in TASK-085's spec.

---

### TASK-085: Comments API — list, create, delete with access and rate-limit rules

**Shared engagement rule:** US-051 already has the pure rule `canLike(access: Exclude<PostAccess, 'hidden'>, status, allowWithoutAccess)` in `post-likes.service.ts`. Rename it to `canEngage` and update its doc comment to say "the like/comment rule (US-051/US-052)". Update its 3 call sites: `post-likes.service.ts` (definition + `assertCanLike`) and `apps/api/src/modules/posts/public-posts.service.ts:114`. Leave the behaviour alone. The US-051 tests must pass unchanged. Comments import `canEngage` from `post-likes.service.js`, and no new rule file is added.

**Service** (`apps/api/src/modules/engagement/post-comments.service.ts`, `PostCommentsService`; inject `PrismaService`, `PostAccessService`, `@Inject(ENV)`):

- `private async loadPost(postId)`: `prisma.post.findUnique({ where: { id: postId }, select: { status: true, creatorProfile: { select: { userId: true } } } })`. The caller already got `hidden` for a missing post, so a null here also means `NOT_FOUND`.
- `private async gate(postId, userId, allowLocked)`, which mirrors `PostLikesService.assertCanLike`. `access = await this.access.check(postId, userId)`. `hidden` → `NOT_FOUND`. `post = await loadPost`. If `post?.status !== 'PUBLISHED'` → `POST_NOT_AVAILABLE`. If `!canEngage(access, post.status, allowLocked)` → `FORBIDDEN`. It returns `{ access, status, ownerUserId }`.
- `list(postId, userId | null, cursor?: string): Promise<PostCommentList>`:
  - `gate(postId, userId, env.PREMIUM_COMMENTS_READ_WITHOUT_ACCESS)`.
  - `rows = prisma.postComment.findMany({ where: { postId, deletedAt: null, ...(cursor && { id: { gt: cursor } }) }, orderBy: { id: 'asc' }, take: POST_COMMENTS_PAGE_SIZE + 1, select: { id, body, createdAt, userId, user: { select: { displayName: true } } } })`.
  - `hasMore = rows.length > PAGE_SIZE`; slice. `nextCursor = hasMore ? last.id : null`.
  - Each item: `{ id, body, createdAt: toISOString(), author: { displayName }, canDelete: userId !== null && (row.userId === userId || ownerUserId === userId) }`. **Never return `userId`.**
  - `canComment = userId !== null && canEngage(access, status, env.PREMIUM_COMMENTS_WRITE_WITHOUT_ACCESS)`.
- `create(postId, userId, input: CreatePostCommentInput): Promise<PostComment>`:
  - `gate(postId, userId, env.PREMIUM_COMMENTS_WRITE_WITHOUT_ACCESS)`.
  - Rate limit: `recent = prisma.postComment.count({ where: { userId, createdAt: { gte: new Date(Date.now() - 60_000) } } })` (it includes deleted comments). If `recent >= env.COMMENT_RATE_LIMIT_PER_MINUTE`, throw `DomainError('RATE_LIMITED')`. Add the `shortcut:` comment from Risks.
  - `prisma.postComment.create({ data: { postId, userId, body: input.body }, select: … })` → map with `canDelete: true`. Add `// shortcut: no post-row lock; a comment racing an archive is invisible and non-financial.`
- `delete(postId, commentId, userId): Promise<void>`:
  - `access = await this.access.check(postId, userId)`. `hidden` → `NOT_FOUND`.
  - `comment = prisma.postComment.findFirst({ where: { id: commentId, postId, deletedAt: null }, select: { userId: true } })`. If missing, return `NOT_FOUND`.
  - `post = loadPost(postId)`. If `comment.userId !== userId && post.creatorProfile.userId !== userId`, throw `FORBIDDEN`.
  - `prisma.postComment.updateMany({ where: { id: commentId, deletedAt: null }, data: { deletedAt: new Date(), deletedByUserId: userId } })`. The `deletedAt: null` filter makes concurrent deletes safe: the second one updates 0 rows and still answers 204.

**Controller** (`apps/api/src/modules/engagement/post-comments.controller.ts`): `@Controller('posts')`, `@Header('cache-control', 'no-store')` on every route. Ids go through `ParseUUIDPipe` (malformed → 400, same as likes).
- `@Get(':id/comments')` + `@UseGuards(OptionalSessionGuard)`. `@Query('cursor')` is optional and validated with `new ZodValidationPipe(z.uuid().optional())`. Returns `PostCommentList`.
- `@Post(':id/comments')` + `@UseGuards(SessionGuard)`. `@Body(new ZodValidationPipe(createPostCommentSchema))` → 201 `PostComment`.
- `@Delete(':id/comments/:commentId')` + `@UseGuards(SessionGuard)` + `@HttpCode(204)`.
- The CSRF guard already covers POST/DELETE with the session cookie.

Register the controller and service in `engagement.module.ts`. The module already imports `EntitlementsModule`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/modules/engagement/post-likes.service.ts`, `apps/api/src/modules/posts/public-posts.service.ts` | rename `canLike` → `canEngage` |
| CREATE | `apps/api/src/modules/engagement/post-comments.service.ts` | list/create/delete |
| CREATE | `apps/api/src/modules/engagement/post-comments.controller.ts` | routes |
| MODIFY | `apps/api/src/modules/engagement/engagement.module.ts` | register |
| CREATE | `apps/api/src/modules/engagement/post-comments.integration.spec.ts` | tests (fixed ids range `29`: `0190a000-0000-7000-8000-000000029…`) |

**Testing** (`post-comments.integration.spec.ts`, real Postgres, sessions as in existing specs, `Origin: WEB_ORIGIN` on mutations):
- Create on a published FREE post → 201. The body is trimmed, `author.displayName` is the user's, and `canDelete` is true. Whitespace-only and 501-char bodies → 400 `VALIDATION_FAILED`. No session → 401. A cookie without a valid Origin → 403 (CSRF).
- The text `<script>alert(1)</script>` is stored and returned verbatim, so escaping is the web's job and the API does not mangle it.
- List: an anonymous visitor reads a free post's comments, with `canComment: false` and `canDelete: false` on every item. Ordering is oldest first. With 51 comments (seed them via `createMany` with ascending ids), page 1 has 50 items and a `nextCursor`, and page 2 has 1 item and `nextCursor: null`. A malformed cursor → 400. No `userId` appears anywhere in the response JSON.
- Status: a non-owner on a DRAFT / ARCHIVED / REMOVED post → 404 `NOT_FOUND` for GET and POST. The **owner** of an ARCHIVED post → GET and POST give 404 `POST_NOT_AVAILABLE`, but DELETE of a comment on it → 204.
- PREMIUM published post, non-owner without access: GET → 403 and POST → 403 by default. With `PREMIUM_COMMENTS_READ_WITHOUT_ACCESS=true` (override `ENV` in the testing module), GET → 200 with `canComment: false`. With the WRITE flag on, POST → 201. The owner can read and write on their own premium post.
- Delete: the author → 204, then the comment is gone from the list for anonymous, the author and the owner. The DB row has `deleted_at` and `deleted_by_user_id` set. The post owner deletes another user's comment → 204, and `canDelete` was true for the owner on that item. A third user → 403. A second delete → 404. A comment id from another post → 404. `Promise.all` of 2 deletes by the author → no 5xx, and the row is soft-deleted once.
- Rate limit: with `COMMENT_RATE_LIMIT_PER_MINUTE=3`, the 4th POST within a minute → 429 `RATE_LIMITED`. Deleting a comment does not free a slot. Another user is unaffected.
- CHECK: a raw `INSERT` with a 501-char body → it fails.
- The US-051 like tests still pass after the `canEngage` rename.

---

### TASK-086: Comments section on the post page

**Server fetch** (`apps/web/src/lib/api/post-comments.ts`, server only, same pattern as `public-post.ts`):
- `getPostComments(postId: string): Promise<PostCommentList | 'forbidden' | null>` calls `GET /${API_PREFIX}/posts/${id}/comments`. It forwards the session cookie, uses `cache: 'no-store'`, and parses with `postCommentListSchema`. A 403 returns `'forbidden'`, a 404 returns `null`, and anything else that is not ok throws.

**Client component** (`apps/web/src/components/post-comments.tsx`, `'use client'`):
- Props: `{ postId: string; path: string; initial: PostCommentList; loggedIn: boolean }`.
- State: `items`, `nextCursor`. It renders an `<ul>` of comments: `author.displayName`, the date (format it the way the post meta line does), and `<p className="whitespace-pre-wrap wrap-break-word">{c.body}</p>`, which is **plain text**. Never use `dangerouslySetInnerHTML`, markdown or linkify.
- `canDelete` → a ghost `Button` "Hapus" with `aria-label="Hapus komentar"`. It asks `window.confirm('Hapus komentar ini?')`, then sends `fetch(\`/${API_PREFIX}/posts/${postId}/comments/${id}\`, { method: 'DELETE' })`. On 204 or 404 it removes the item.
- Form when `initial.canComment`: `Label` + `Textarea` (`maxLength={POST_COMMENT_MAX_LENGTH}`) with a counter `n/500`, and a submit `Button` "Kirim" that is disabled while pending or when the trimmed text is empty. It POSTs JSON `{ body }`, parses the response with `postCommentSchema`, appends it, and clears the field. When `nextCursor !== null`, the new comment is not appended, because it sits at the end of the thread. Show a short "Komentar terkirim" note instead.
- Not logged in → a link "Masuk untuk berkomentar" to `loginHref(path)`. Logged in without `canComment` → no form.
- `nextCursor` → a "Muat lebih banyak" button that GETs `?cursor=` and appends.
- Any failure shows a `role="alert"` message. Use the API `error.message` when present (for example the 429 text), otherwise "Gagal menyimpan. Coba lagi."

**Post page** (`apps/web/src/app/(public)/[creatorSlug]/posts/[postId]/page.tsx`): when `post.status === 'PUBLISHED'`, fetch `getPostComments(post.id)` alongside what is already loaded, plus the current user via `getCurrentUser()` if the page does not already have it. Render a `<section aria-labelledby="comments-heading">` with an `h2` "Komentar" under the like button:
- a list → `<PostComments …/>`
- `'forbidden'` → "Buka post ini untuk melihat dan menulis komentar."
- `null` → nothing

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/lib/api/post-comments.ts`, `post-comments.test.ts` | server fetch |
| CREATE | `apps/web/src/components/post-comments.tsx`, `post-comments.test.tsx` | comments UI |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/posts/[postId]/page.tsx`, `page.test.tsx` | render the section |

**Testing:**
- `post-comments.test.ts` (mock `fetch`): it forwards the cookie, a 403 → `'forbidden'`, a 404 → `null`, and a 500 throws.
- `post-comments.test.tsx` (Testing Library, mock `fetch`):
  - A body of `<script>alert(1)</script><b>x</b>` renders as literal text: `getByText` matches the raw string and the container holds no `script`/`b` element.
  - Submit sends POST with the trimmed body and appends the returned comment.
  - The button is disabled for whitespace-only text.
  - A 429 shows the API message in the alert.
  - "Hapus" is shown only when `canDelete`. Clicking it with confirm stubbed true sends DELETE and removes the item.
  - Anonymous → the login link points to `/login?returnTo=<path>`.
  - "Muat lebih banyak" fetches with `cursor` and appends.
- `page.test.tsx`: a published post renders the comments section. `'forbidden'` renders the locked text. A non-published post (owner's draft) renders no section.
- Manual check: `pnpm dev`, then log in as `subscriberA` and comment on a free post of `claudiandreya`. Log out and the comment is still visible, with a login link. Log in as the creator, delete it, and it is gone for everyone.

Run `pnpm check` before marking each task done.
