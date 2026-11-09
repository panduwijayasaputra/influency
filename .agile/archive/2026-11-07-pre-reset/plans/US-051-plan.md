# Technical Plan: US-051 — Like a Post

## Architecture Overview

Likes are one row per `(post, user)` in a new `post_likes` table. The unique constraint makes a second like impossible. Like inserts with `ON CONFLICT DO NOTHING` (Prisma `createMany({ skipDuplicates: true })`), unlike deletes. Both are idempotent `PUT` / `DELETE` endpoints. Counts come from `COUNT(*)` via Prisma `_count`, so there is no counter column to keep in sync.

These decisions were agreed with the user:

- **A new `engagement` module** (`apps/api/src/modules/engagement/`). US-052 comments will join it. It imports `EntitlementsModule` and never re-implements the access rule.
- **One "can like" rule for both like and unlike**, evaluated server-side for the session user:
  1. `PostAccessService.check(postId, userId)` returns `hidden` → 404 `NOT_FOUND`.
  2. The post is not `PUBLISHED` (an owner's or admin's draft, pending, archived or removed post) → 404 `POST_NOT_AVAILABLE`.
  3. Access is `locked` and `PREMIUM_LIKES_WITHOUT_ACCESS` is false → 403 `FORBIDDEN`.
  4. Otherwise the user may like or unlike.

  A stale like on an archived post (or after a user loses access) stays until the post is likeable again. That is accepted.
- **[TBD] policy placeholder:** the env flag `PREMIUM_LIKES_WITHOUT_ACCESS` (default `false` = "only viewers with access"). It follows the `POST_MODERATION_REQUIRED` pattern.
- **Counts on every public post:** `PublicPost.likeCount` appears in the feed and the detail view. `PublicPostDetail.viewer` is `{ liked, canLike } | null` (`null` = anonymous), so the web knows what to render without another call. `canLike` uses exactly the rule above.
- **No rate limit for now** (agreed): likes are idempotent and non-financial, and the unique constraint caps the damage.

| AC | Covered by |
|----|------------|
| Like/unlike a published post the user may view; at most one like, even under repeated or simultaneous requests | `PUT`/`DELETE /posts/:id/like` + `UNIQUE(post_id, user_id)` + skipDuplicates; repeated and concurrent tests |
| Logged-out visitors see the count and are sent to login, returning to the post | `likeCount` in public responses; `viewer: null` → `LikeButton` renders a link to `loginHref(path)` |
| Counts on published posts; archived, draft and removed posts accept no likes | `likeCount` in feed and detail; rule step 2 (`POST_NOT_AVAILABLE`), tests per status |
| Premium without access is a configurable policy, default "only viewers with access" | `PREMIUM_LIKES_WITHOUT_ACCESS` (default false), rule step 3; tests with the flag both ways |

## Dependencies

- None. No new packages.

## Risks

- **A like racing an archive:** a like can commit right after the post is archived, because there is no post-row lock. This is harmless: the post is invisible and nothing financial is involved. It is accepted, and the service carries a `shortcut:` comment.
- **Count queries:** `_count` runs one `COUNT` per post (30 at most in the feed), served by the unique index whose leading column is `post_id`. That is fine at MVP scale. If it gets slow, add a cached counter later.
- **Adding `likeCount` / `viewer` to shared schemas** breaks fixtures in existing tests (shared `posts.test.ts`, web page tests, API public-post specs). Update them in the same task.

## Tasks

### TASK-081: Post likes — table, env flag and shared contract

**Prisma** (`apps/api/prisma/schema.prisma`), a new model after `PostArchiveEpisode`:

```prisma
/// US-051: one like per (post, user); like = insert ON CONFLICT DO NOTHING, unlike = delete.
model PostLike {
  id        String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  postId    String   @map("post_id") @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  post      Post     @relation(fields: [postId], references: [id], onDelete: Restrict)
  user      User     @relation(fields: [userId], references: [id], onDelete: Restrict)

  @@unique([postId, userId])
  @@index([userId])
  @@map("post_likes")
}
```

Add `likes PostLike[]` to `Post` and `postLikes PostLike[]` to `User`. Create the migration with `pnpm db:migrate` (name it `post_likes`), then run `pnpm --filter @influency/api generate`. `schema-conventions.integration.spec.ts` must still pass.

**Env** (`apps/api/src/common/env.ts`): add the following after `PREMIUM_COVER_CLEAR_ALLOWED`:

```ts
// TBD placeholder (Monetization Spec v1 §2, engagement rules OPEN): when true, logged-in users may like a premium
// post they have not unlocked. Default: only viewers with access.
PREMIUM_LIKES_WITHOUT_ACCESS: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
```

Add it to `.env.example` with a `# Placeholder (TBD): …` comment like its neighbours. Extend `env.spec.ts` the way the `POST_MODERATION_REQUIRED` cases do (default false, `'true'` → true, other values rejected).

**Shared** (`packages/shared/src/posts.ts`):
- In `publicPostSchema`, add `likeCount: z.int()` (comment: likes of the post; shown on every published post).
- In `publicPostDetailSchema`, add `viewer: z.object({ liked: z.boolean(), canLike: z.boolean() }).nullable()` (comment: null = anonymous; `canLike` is the server-side like rule).
- New `postLikeResponseSchema = z.object({ liked: z.boolean(), likeCount: z.int() })` + `PostLikeResponse` type (the index already re-exports `posts.js`).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/prisma/schema.prisma` | `PostLike` model + relations |
| CREATE | `apps/api/prisma/migrations/<ts>_post_likes/migration.sql` | generated |
| MODIFY | `apps/api/src/common/env.ts`, `env.spec.ts`, `.env.example` | `PREMIUM_LIKES_WITHOUT_ACCESS` |
| MODIFY | `packages/shared/src/posts.ts`, `posts.test.ts` | `likeCount`, `viewer`, `postLikeResponseSchema` |

**Testing:**
- `posts.test.ts`: fixtures gain `likeCount: 0` (and `viewer: null` on detail). The detail schema accepts `viewer: { liked: true, canLike: false }` and rejects a missing `likeCount`. `postLikeResponseSchema` parses `{ liked: true, likeCount: 1 }`.
- `env.spec.ts`: flag default and parsing.

---

### TASK-082: Like / unlike API and like counts on public posts

**Engagement module** (`apps/api/src/modules/engagement/`):

- `engagement.module.ts`: `imports: [EntitlementsModule]`, controller `PostLikesController`, provider `PostLikesService`. Register it in `app.module.ts`. Export `PostLikesService` (`PublicPostsService` needs `canLike`) and import `EngagementModule` in `PostsModule`. If that creates a circular import, put `canLike` in `EntitlementsModule` instead. Don't use `forwardRef`.
- `post-likes.service.ts`, `PostLikesService` (inject `PrismaService`, `PostAccessService`, `@Inject(ENV)`):
  - `private async assertCanLike(postId: string, userId: string): Promise<void>`:
    - `const access = await this.access.check(postId, userId)`; `hidden` → throw `DomainError('NOT_FOUND')`.
    - Load `post.status` with `findUnique({ select: { status } })`. Anything other than `PUBLISHED` → `DomainError('POST_NOT_AVAILABLE')`.
    - `access === 'locked' && !env.PREMIUM_LIKES_WITHOUT_ACCESS` → `DomainError('FORBIDDEN')`.
  - `canLike(postId, userId, access: 'full' | 'locked', status: PostStatus): boolean`: the same rule as a pure function, so `PublicPostsService.get` can reuse the access and status it already loaded. Make `assertCanLike` call it too, so there is one rule.
  - `like(postId, userId): Promise<PostLikeResponse>`: `assertCanLike`, then `prisma.postLike.createMany({ data: [{ postId, userId }], skipDuplicates: true })`, then return `{ liked: true, likeCount: await count(postId) }`. Add the comment `// shortcut: no post-row lock; a like racing an archive is harmless (post invisible, non-financial).`
  - `unlike(postId, userId)`: `assertCanLike`, then `prisma.postLike.deleteMany({ where: { postId, userId } })`, then `{ liked: false, likeCount }`.
  - `count(postId) = prisma.postLike.count({ where: { postId } })`.
- `post-likes.controller.ts`: `@Controller('posts')`, `@UseGuards(SessionGuard)`, `@Header('cache-control', 'no-store')`:
  - `@Put(':id/like')` and `@Delete(':id/like')`, with `@Param('id', ParseUUIDPipe)` (malformed → 400, as on media-access) and `req.authSession!.userId`. Both return 200 `PostLikeResponse`.
  - The CSRF guard already covers PUT/DELETE with the session cookie.

**Public posts** (`apps/api/src/modules/posts/public-posts.service.ts`):
- Add `_count: { select: { likes: true } }` to the `include` of `list` and `get`. In `publicPostFields`, add `likeCount: row._count.likes` and widen the row type to match.
- `get(slug, postId, userId)`: after loading the row, `viewer = userId ? { liked, canLike: likes.canLike(postId, userId, access, row.status) } : null`. Here `liked = (await prisma.postLike.findUnique({ where: { postId_userId: { postId, userId } } })) !== null`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/engagement/engagement.module.ts` | module |
| CREATE | `apps/api/src/modules/engagement/post-likes.controller.ts` | `PUT`/`DELETE /posts/:id/like` |
| CREATE | `apps/api/src/modules/engagement/post-likes.service.ts` | like rule, like/unlike/count |
| CREATE | `apps/api/src/modules/engagement/post-likes.integration.spec.ts` | tests (fixed ids range `28`: `0190a000-0000-7000-8000-000000028…`) |
| MODIFY | `apps/api/src/app.module.ts` | import `EngagementModule` |
| MODIFY | `apps/api/src/modules/posts/posts.module.ts`, `public-posts.service.ts` | `likeCount`, `viewer` |
| MODIFY | `apps/api/src/modules/posts/public-posts.integration.spec.ts`, `public-post-detail.integration.spec.ts` | new fields |

**Testing** (`post-likes.integration.spec.ts`, real Postgres, sessions created as in existing specs, `Origin: WEB_ORIGIN` on mutations):
- Like a published FREE post → 200 `{ liked: true, likeCount: 1 }`. Repeat the PUT → still 1. DELETE → `{ liked: false, likeCount: 0 }`. Repeat the DELETE → 0.
- **Concurrent:** `Promise.all` of 5 PUTs by the same user → all 200, exactly 1 row in `post_likes`.
- Two different users → count 2.
- No session → 401 `AUTH_REQUIRED`. Cookie without a valid Origin → 403 (CSRF).
- Malformed id → 400. Unknown id → 404. A non-owner on a DRAFT / ARCHIVED / REMOVED post → 404 `NOT_FOUND` (hidden). The **owner** on their own DRAFT or ARCHIVED post → 404 `POST_NOT_AVAILABLE`. Unlike on an archived post that holds a like → `POST_NOT_AVAILABLE`, and the row stays.
- PREMIUM published post, non-owner without access → 403 `FORBIDDEN` (default policy). With `PREMIUM_LIKES_WITHOUT_ACCESS=true` (override `ENV` in the testing module) → 200. The owner may like their own premium post.
- Public feed: `likeCount` is correct after likes. Detail: anonymous → `viewer: null` + `likeCount`. Logged-in → `viewer.liked` reflects the row. On a locked premium post, `canLike` is false by default. The owner viewing their own draft gets `canLike: false`.

---

### TASK-083: Like button on the post page and counts on feed cards

**Like button** (`apps/web/src/components/like-button.tsx`, `'use client'`):
- Props: `{ postId: string; path: string; likeCount: number; viewer: PublicPostDetail['viewer'] }`.
- Displays a lucide `Heart` icon and the count. Filled heart (`fill-current text-primary`) when `liked`.
- `viewer === null` → `<Link href={loginHref(path)} aria-label="Masuk untuk menyukai">` with the icon + count.
- `viewer.canLike` → `<Button variant="ghost" aria-pressed={liked} aria-label={liked ? 'Batal suka' : 'Suka'}>`. On click it calls `fetch(\`/${API_PREFIX}/posts/${postId}/like\`, { method: liked ? 'DELETE' : 'PUT' })` (same-origin through the rewrite; the browser sends Origin). It parses the response with `postLikeResponseSchema` and sets `liked` / `count` from it. The button is disabled while pending. On failure it keeps the old state and shows a short `role="alert"` text, "Gagal menyimpan. Coba lagi."
- Otherwise (logged in, cannot like) → static icon + count, no button.

**Post page** (`apps/web/src/app/(public)/[creatorSlug]/posts/[postId]/page.tsx`): in `PostDetail`, render `<LikeButton postId={post.id} path={\`/${slug}/posts/${post.id}\`} likeCount={post.likeCount} viewer={post.viewer} />` under the meta line, for every post that returned a body.

**Feed card** (`apps/web/src/app/(public)/[creatorSlug]/creator-posts.tsx`): add the count to the meta line of `PostCard`, e.g. `${post.likeCount} suka`, only when > 0. The whole card is a link, so the feed has no button.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/components/like-button.tsx` | toggle / login link / static count |
| CREATE | `apps/web/src/components/like-button.test.tsx` | Testing Library |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/posts/[postId]/page.tsx` (+ `page.test.tsx` fixtures) | render `LikeButton` |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/creator-posts.tsx` (+ its test fixtures if any) | count on cards |

**Testing:**
- `like-button.test.tsx` (mock `fetch`):
  - `viewer: null` renders a link to `/login?returnTo=<path>` with the count.
  - Clicking with `canLike` sends `PUT` and shows the returned count, with `aria-pressed` true. Clicking again sends `DELETE`.
  - A failed fetch keeps the state and shows the alert.
  - `canLike: false` renders no button.
- `page.test.tsx`: the existing fixtures gain `likeCount` / `viewer`, and the count shows on the detail page.
- Manual check: `pnpm dev`, dev-login as `subscriberA`, like a free post of `claudiandreya`, reload (the like persists), log out (the count shows and the heart links to login).

Run `pnpm check` before marking each task done.
