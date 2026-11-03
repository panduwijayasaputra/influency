# Technical Plan: US-015 — Create and Edit Draft Posts

## Architecture Overview

Agreed with the user: **all studio post endpoints live under `/creators/me/posts`**, mirroring the existing `/creators/me` pattern, so every route is scoped to the caller's own creator profile and `GET /posts/:id` stays free for the public post endpoint (US-014). This differs from the handoff's *initial* §11.2 list (`POST /posts`, `PATCH /posts/:id`); later owner actions follow the same prefix (e.g. US-019 `POST /creators/me/posts/:id/publish`).

1. **Schema:** new `posts` table owned by `creator_profiles` (the creator identity), with `post_visibility` (FREE/PREMIUM) and `post_status` (the handoff §6.1 states: DRAFT, PROCESSING, PENDING_REVIEW, PUBLISHED, HIDDEN, REMOVED; default DRAFT). Only DRAFT is ever written in this story.
2. **API:** new `posts` module (backend.md domain list). `ApprovedCreatorGuard` on the controller; every query filters `creatorProfileId = req.creatorProfileId`. A wrong-owner or unknown id is the same 404 `NOT_FOUND`; a malformed id is 400 (as in `admin-creators.controller.ts`).
3. **Web:** `/studio/posts` (own posts + status), `/studio/posts/new` and `/studio/posts/[postId]` sharing one client `PostForm` (caption + Gratis/Premium). Studio home links to it.

AC mapping:

| Acceptance criterion | How |
|---|---|
| Create a post with caption, FREE or PREMIUM | `POST /creators/me/posts` with `createPostSchema`; `/studio/posts/new` |
| Posts start as DRAFT, not public | DB default `DRAFT`, service never sets status; no public post endpoint exists (US-014 will filter PUBLISHED) |
| Studio lists own posts with status | `GET /creators/me/posts` (newest first) → `/studio/posts` with status label |
| Another creator's post id → not found | Every `findFirst`/`updateMany` includes `creatorProfileId`; 404 `NOT_FOUND`, same as unknown id |

Out of scope (owned elsewhere): status transitions and edit rules after publishing (US-019), price/duration (US-018), media (US-016/017), demo posts in the seed (US-019/US-044), pagination.

## Dependencies

- None new. Reuses `ApprovedCreatorGuard`, `ZodValidationPipe`, `DomainError`, `PrismaService`, `API_ORIGIN`, `SESSION_COOKIE`, shadcn `Button`/`Label`/`Textarea`.

## Risks

- **Edits after publish:** in this story PATCH works regardless of status (only DRAFT exists). US-019 must decide which fields stay editable once PUBLISHED (e.g. visibility FREE↔PREMIUM affects buyers). Flagged here so US-019 picks it up.
- **Route overlap in `/creators`:** `CreatorProfileController` has `GET :slug`, `GET :slug/images/:imageId`, `PUT me/:kind`. `me` can never be a slug (min 3 chars) and static segments win in find-my-way; the integration spec asserts `GET /creators/me/posts` reaches the posts controller and `GET /creators/me` still works.
- **Unbounded list:** no pagination. `shortcut:` comment in the service; add cursor pagination when a creator has more than ~100 posts.

## Tasks

### TASK-041: `posts` schema, migration and shared post contract

**Prisma** (`apps/api/prisma/schema.prisma`), following the header conventions:

```prisma
enum PostVisibility {
  FREE
  PREMIUM

  @@map("post_visibility")
}

/// Handoff §6.1 lifecycle. US-015 only creates DRAFT; transitions arrive with US-019.
enum PostStatus {
  DRAFT
  PROCESSING
  PENDING_REVIEW
  PUBLISHED
  HIDDEN
  REMOVED

  @@map("post_status")
}

/// A creator's post (US-015). Owned by the creator profile; never deleted by the app.
model Post {
  id               String         @id @default(dbgenerated("uuidv7()")) @db.Uuid
  creatorProfileId String         @map("creator_profile_id") @db.Uuid
  visibility       PostVisibility
  status           PostStatus     @default(DRAFT)
  caption          String         @default("")
  publishedAt      DateTime?      @map("published_at") @db.Timestamptz(3)
  createdAt        DateTime       @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt        DateTime       @updatedAt @map("updated_at") @db.Timestamptz(3)
  creatorProfile   CreatorProfile @relation(fields: [creatorProfileId], references: [id], onDelete: Restrict)

  @@index([creatorProfileId, createdAt])
  @@map("posts")
}
```

Add `posts Post[]` to `CreatorProfile`. Create the migration with `pnpm db:migrate` (name `posts`), then append a CHECK in the migration SQL, in the style of `creator_application_reviews_reason`:

```sql
-- Caption limit mirrors POST_CAPTION_MAX_LENGTH (placeholder) so a bypassed API can't store more.
ALTER TABLE "posts" ADD CONSTRAINT "posts_caption_length" CHECK (char_length("caption") <= 2000);
```

Run `pnpm --filter @influency/api generate`. The schema-conventions spec must pass unchanged.

**Shared** — new `packages/shared/src/posts.ts`, exported from `index.ts`:

```ts
/** Placeholder limit (TBD business decision): max caption length in characters. */
export const POST_CAPTION_MAX_LENGTH = 2000;
export const POST_VISIBILITIES = ['FREE', 'PREMIUM'] as const;
export const POST_STATUSES = ['DRAFT', 'PROCESSING', 'PENDING_REVIEW', 'PUBLISHED', 'HIDDEN', 'REMOVED'] as const;
export type PostVisibility = (typeof POST_VISIBILITIES)[number];
export type PostStatus = (typeof POST_STATUSES)[number];

const captionSchema = z.string().trim().max(POST_CAPTION_MAX_LENGTH, `Caption maksimal ${POST_CAPTION_MAX_LENGTH} karakter.`);

/** Body of POST /creators/me/posts. Caption may be empty (media arrives in US-016/017). */
export const createPostSchema = z.object({
  caption: captionSchema.default(''),
  visibility: z.enum(POST_VISIBILITIES, 'Pilih Gratis atau Premium.'),
});
export type CreatePostInput = z.infer<typeof createPostSchema>;

/** Body of PATCH /creators/me/posts/:id: any subset; status is not editable here. */
export const updatePostSchema = z
  .object({ caption: captionSchema, visibility: z.enum(POST_VISIBILITIES, 'Pilih Gratis atau Premium.') })
  .partial()
  .refine((input) => Object.keys(input).length > 0, 'Tidak ada perubahan.');
export type UpdatePostInput = z.infer<typeof updatePostSchema>;

/** The caller's own post (studio endpoints). Dates are ISO strings. */
export const studioPostSchema = z.object({
  id: z.string(),
  caption: z.string(),
  visibility: z.enum(POST_VISIBILITIES),
  status: z.enum(POST_STATUSES),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type StudioPost = z.infer<typeof studioPostSchema>;
export const studioPostListSchema = z.object({ posts: z.array(studioPostSchema) });
export type StudioPostList = z.infer<typeof studioPostListSchema>;
```

Unknown keys (e.g. `status`, `creatorProfileId`) are stripped by `z.object` defaults, so a client cannot set them.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/prisma/schema.prisma` | enums + `Post` model + `CreatorProfile.posts` |
| CREATE | `apps/api/prisma/migrations/<ts>_posts/migration.sql` | generated + caption CHECK |
| CREATE | `packages/shared/src/posts.ts` | constants, request/response schemas |
| CREATE | `packages/shared/src/posts.test.ts` | schema tests |
| MODIFY | `packages/shared/src/index.ts` | `export * from './posts.js';` |

**Testing:**
- `posts.test.ts`: create accepts `{ visibility: 'FREE' }` (caption → `''`), trims caption, rejects 2001 chars, rejects missing/unknown visibility with the Bahasa message, strips `status`; update rejects `{}` and accepts `{ caption: '' }`.
- Migration applies on the test DB (global setup) and `schema-conventions.integration.spec.ts` passes.

---

### TASK-042: Studio posts API (`/creators/me/posts`)

New module `apps/api/src/modules/posts/`, registered in `app.module.ts` imports.

`posts.controller.ts`:

```ts
const postIdPipe = new ZodValidationPipe(z.uuid());

/** The approved creator's own posts. Every route is scoped to req.creatorProfileId. */
@Controller('creators/me/posts')
@UseGuards(ApprovedCreatorGuard)
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Post()                       // 201
  create(@Req() req, @Body(new ZodValidationPipe(createPostSchema)) body: CreatePostInput): Promise<StudioPost>

  @Get() @Header('cache-control', 'no-store')
  list(@Req() req): Promise<StudioPostList>

  @Get(':id') @Header('cache-control', 'no-store')
  get(@Req() req, @Param('id', postIdPipe) id: string): Promise<StudioPost>

  @Patch(':id')
  update(@Req() req, @Param('id', postIdPipe) id: string, @Body(new ZodValidationPipe(updatePostSchema)) body: UpdatePostInput): Promise<StudioPost>
}
```

(`req: FastifyRequest`, read `req.creatorProfileId!` as in `creator-profile.controller.ts`.)

`posts.service.ts` (inject `PrismaService`):

- `create(creatorProfileId, input)` → `prisma.post.create({ data: { creatorProfileId, caption: input.caption, visibility: input.visibility } })` (status from the DB default) → `toStudioPost`.
- `list(creatorProfileId)` → `findMany({ where: { creatorProfileId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })`, with `// shortcut: no pagination, add cursor pagination when creators exceed ~100 posts.`
- `get(creatorProfileId, id)` → `findFirst({ where: { id, creatorProfileId } })` ?? `throw new DomainError('NOT_FOUND')`.
- `update(creatorProfileId, id, input)` → `updateMany({ where: { id, creatorProfileId }, data: input })`; `count === 0` → `NOT_FOUND`; then return `get(...)`. (One owner-scoped write; no read-then-write window.)
- `toStudioPost(row)`: picks `id, caption, visibility, status`, and `createdAt/updatedAt` as `toISOString()`. Never returns `creatorProfileId`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/posts/posts.module.ts` | module |
| CREATE | `apps/api/src/modules/posts/posts.controller.ts` | 4 routes |
| CREATE | `apps/api/src/modules/posts/posts.service.ts` | owner-scoped queries |
| CREATE | `apps/api/src/modules/posts/posts.integration.spec.ts` | tests below |
| MODIFY | `apps/api/src/app.module.ts` | import `PostsModule` |

**Testing** (`posts.integration.spec.ts`, real Postgres; boot and session setup copied from `creator-profile.integration.spec.ts` incl. its object-storage + Telegram overrides; own fixed user ids outside `DEMO_USER_IDS`; `profileFields()`; `afterAll` deletes posts → sessions → creator profiles → users for these ids; mutating requests send `cookie` + `origin: WEB_ORIGIN`):
- Create FREE and PREMIUM → 201, `status: 'DRAFT'`, body keys exactly `id, caption, visibility, status, createdAt, updatedAt`; caption trimmed; caption omitted → `''`.
- Body `{ status: 'PUBLISHED', visibility: 'FREE' }` → 201 with `status: 'DRAFT'` (status ignored).
- Invalid visibility / 2001-char caption → 400 `VALIDATION_FAILED` with `details.issues[].path` `visibility` / `caption`.
- List returns only the caller's posts, newest first, `cache-control: no-store`; creator B's list never contains creator A's posts.
- Get own post → 200; PATCH caption and visibility → 200 with new values and later `updatedAt`; PATCH `{}` → 400.
- Creator B GET / PATCH creator A's post id → 404 `NOT_FOUND`, body identical (except `requestId`) to an unknown uuid; A's row unchanged in the DB.
- Malformed id → 400 `VALIDATION_FAILED`.
- No cookie → 401 `AUTH_REQUIRED`; pending-creator / plain user → 403 `CREATOR_NOT_APPROVED`; POST with cookie but no/foreign `Origin` → 403 `FORBIDDEN`.
- Route overlap: `GET /creators/me` still returns the profile; `GET /creators/<slug>` still public.

---

### TASK-043: Studio posts pages (`/studio/posts`, `/new`, `/[postId]`)

Server fetchers in `apps/web/src/lib/api/studio-posts.ts`, same shape as `creator-profile.ts` (forward only the session cookie, `cache: 'no-store'`, parse with shared schemas):

- `getMyPosts(): Promise<StudioPostList | null>` — null on 401/403.
- `getMyPost(id: string): Promise<StudioPost | null>` — null on 400/401/403/404 (page shows not-found).

Pages (all under the existing studio layout/`StudioGate`; session-reading parts inside `<Suspense>` like `studio/profile/page.tsx`):

- `apps/web/src/app/studio/posts/page.tsx` — title "Konten", link button "Buat post" → `/studio/posts/new`, `<Suspense>` → `MyPostList` (server component, same folder `my-post-list.tsx`): each row links to `/studio/posts/{id}` and shows the caption (first line truncated, or "Tanpa caption"), visibility label (Gratis / Premium) and status label. Empty state: "Belum ada post." Labels in one map, e.g. `POST_STATUS_LABELS: Record<PostStatus, string>` = `{ DRAFT: 'Draf', PROCESSING: 'Diproses', PENDING_REVIEW: 'Menunggu tinjauan', PUBLISHED: 'Terbit', HIDDEN: 'Disembunyikan', REMOVED: 'Dihapus' }` in `apps/web/src/app/studio/posts/labels.ts` (with `VISIBILITY_LABELS`).
- `apps/web/src/app/studio/posts/new/page.tsx` — title "Buat Post", renders `<PostForm />`.
- `apps/web/src/app/studio/posts/[postId]/page.tsx` — title "Edit Post", `<Suspense>` → server component reads the post with `getMyPost(postId)`; null → "Post tidak ditemukan." (+ link back), else status label and `<PostForm post={post} />`. Check the bundled Next 16 docs (`apps/web/node_modules/next/dist/docs/`) for async `params` under `cacheComponents`.
- `apps/web/src/app/studio/posts/post-form.tsx` — `'use client'`, modelled on `studio/profile/creator-profile-form.tsx`: `Textarea` caption (with `Label`, character count `n/2000` from `POST_CAPTION_MAX_LENGTH`), visibility as a two-option radio group (native `<input type="radio">` in a `<fieldset><legend>Jenis post</legend>`: "Gratis", "Premium"; required on create). Client-side `safeParse` with `createPostSchema` / `updatePostSchema`; map `details.issues` by `path` like `byField`. Submit: create → `POST /api/v1/creators/me/posts` then `router.push('/studio/posts/{id}')`; edit → `PATCH /api/v1/creators/me/posts/{id}` then "Tersimpan." + `router.refresh()`. `credentials: 'include'`, button disabled while pending, `FORBIDDEN`/other errors → form-level message from the error body.
- `apps/web/src/app/studio/page.tsx` — add a "Konten" link to `/studio/posts` next to "Edit profil".

No new top-level route, so `RESERVED_SLUGS` is unchanged.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/lib/api/studio-posts.ts` | `getMyPosts`, `getMyPost` |
| CREATE | `apps/web/src/lib/api/studio-posts.test.ts` | fetcher tests |
| CREATE | `apps/web/src/app/studio/posts/page.tsx` | list page |
| CREATE | `apps/web/src/app/studio/posts/my-post-list.tsx` | list server component |
| CREATE | `apps/web/src/app/studio/posts/labels.ts` | status/visibility labels |
| CREATE | `apps/web/src/app/studio/posts/post-form.tsx` | create/edit form |
| CREATE | `apps/web/src/app/studio/posts/post-form.test.tsx` | form tests |
| CREATE | `apps/web/src/app/studio/posts/new/page.tsx` | create page |
| CREATE | `apps/web/src/app/studio/posts/[postId]/page.tsx` | edit page |
| MODIFY | `apps/web/src/app/studio/page.tsx` | "Konten" link |

**Testing** (Vitest + Testing Library, mock `fetch` / `next/navigation` as in `creator-profile-form.test.tsx` and `current-user.test.ts`):
- `studio-posts.test.ts`: forwards only the session cookie; no cookie → null without fetching; 401/403 → null; `getMyPost` 404/400 → null; 500 → throws.
- `post-form.test.tsx`: create without visibility shows "Pilih Gratis atau Premium." and does not fetch; create posts `{ caption, visibility }` and navigates to `/studio/posts/<id>`; edit sends PATCH with the changed fields and shows "Tersimpan."; API 400 issues show under the matching field; button disabled while pending.
- Manual: `pnpm dev`, dev-login as `claudia`, create FREE + PREMIUM drafts, edit one, list shows "Draf"; dev-login as `creatorB` and open Claudia's post URL → "Post tidak ditemukan."
