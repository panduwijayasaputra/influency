# Technical Plan: US-019 — Publish a Post

## Architecture Overview

Agreed with the user:

- **Two owner-scoped state transitions** in the studio posts module, both inside a transaction that locks the post row (`SELECT … FOR UPDATE`, the same pattern as `setOffer` / media `createUpload`):
  - `POST /creators/me/posts/:id/publish` — allowed from `DRAFT` or `HIDDEN`. Moves the post to `PUBLISHED`, or to `PENDING_REVIEW` when `POST_MODERATION_REQUIRED=true` (env, default `false`, TBD placeholder). `published_at` is set only on the first publish (`COALESCE`), so re-publishing a hidden post keeps its feed position.
  - `POST /creators/me/posts/:id/hide` — allowed from `PUBLISHED` or `PENDING_REVIEW`. Moves the post to `HIDDEN`.
  - Wrong status → 409 `POST_STATUS_CONFLICT`. `REMOVED` (admin, later) and `PROCESSING` (unused) can't be published or hidden by the creator.
- **Publish checks**, in this order, under the lock:
  1. At least one `READY` media asset, else 409 `MEDIA_REQUIRED`.
  2. No media asset in `PROCESSING`, else 409 `MEDIA_PROCESSING`.
  3. A `PREMIUM` post has a current offer (any row in `post_offers`), else 409 `OFFER_REQUIRED`.
- **Edit rules while a post is live** (`PUBLISHED` / `PENDING_REVIEW`): **only the caption is editable**. Visibility changes, media upload slots, media complete and media delete return 409 `POST_LOCKED`. The creator hides the post first to change them. Editable statuses are a shared constant `POST_EDITABLE_STATUSES = ['DRAFT', 'HIDDEN']`. Offers stay editable in any status (US-018 versioning exists for exactly that).
- **Public feed**: `GET /api/v1/creators/:slug/posts` (handoff §11.2) is public. It returns only `PUBLISHED` posts of a visible creator (same `PUBLIC_CREATOR` rule and same 404 as the profile), newest `published_at` first, capped at the 30 newest. Each item has `id, visibility, caption, publishedAt, imageCount, videoCount, offer: { priceCoins, durationSeconds } | null` (offer only for PREMIUM). It **never** includes media ids, keys, uids or URLs. `cache-control: no-store`, so hiding takes effect immediately.
- **Public page** `/{creatorSlug}`: the "Konten" placeholder becomes a "Gratis" section and a "Premium" section. Cards show the caption, "n foto · n video", and for premium a lock + "5 Koin · 7 hari". The feed is fetched **uncached** inside `<Suspense>`. The profile stays cached. No media is rendered: free and premium media both arrive through the access-checked path in US-020/021.
- **Studio**: the post edit page gets "Publikasikan" / "Sembunyikan" buttons. The visibility radio, media upload and media delete are disabled while the post is live, with a hint.

```
POST /creators/me/posts/:id/publish
  BEGIN
    SELECT status::text, visibility::text FROM posts WHERE id=$1 AND creator_profile_id=$2 FOR UPDATE   → none: 404
    status ∉ {DRAFT, HIDDEN}                     → 409 POST_STATUS_CONFLICT
    count media READY = 0                        → 409 MEDIA_REQUIRED
    count media PROCESSING > 0                   → 409 MEDIA_PROCESSING
    PREMIUM and no post_offers row               → 409 OFFER_REQUIRED
    UPDATE posts SET status = PUBLISHED|PENDING_REVIEW, published_at = COALESCE(published_at, now())
  COMMIT → 200 StudioPost
```

AC mapping:

| Acceptance criterion | How |
|---|---|
| Publishing moves to `PUBLISHED` (or `PENDING_REVIEW` if configured) | `publish` + `POST_MODERATION_REQUIRED` env flag |
| Premium can't publish without an active offer | `OFFER_REQUIRED` check under the post-row lock. Visibility is locked while live, so a live post can't become premium-without-offer later |
| Published posts appear in the right section (free / premium preview) | Public `GET /creators/:slug/posts` + Gratis / Premium sections on `/{creatorSlug}` |
| Creator can hide a published post, removing it from the public page | `hide` → `HIDDEN`; feed filters `status = PUBLISHED` and is uncached |

Out of scope: admin approval of `PENDING_REVIEW` posts (admin story; with the flag on, posts stay off the public page), public post detail page (US-014), rendering any media publicly (US-020/021), feed pagination beyond the 30 newest, new-post notifications, demo published posts in the seed (US-044).

## Dependencies

- None new. No migration: `posts.status` / `published_at` already exist (US-015).
- Existing: `ApprovedCreatorGuard`, `ZodValidationPipe`, `DomainError`, `PUBLIC_CREATOR` filter in `creator-profile.service.ts`, `ENV` token, post-row lock pattern.

## Risks

- **Publish vs concurrent media delete / visibility change.** If these don't lock the post row, a delete could remove the last media right after publish counted it. Mitigation: media `remove` takes the same post-row lock and checks the status. The visibility PATCH is one conditional `updateMany` (Postgres re-evaluates its WHERE after waiting on the lock, so it sees `PUBLISHED`).
- **Upload slot created before publish, completed after.** `complete` checks the post status first and returns `POST_LOCKED` (best-effort, no lock). The race window (complete started before the publish committed) only *adds* media to the creator's own live post, which is acceptable. Note it with a `shortcut:` comment.
- **Studio form always sends `visibility`.** `PostForm` sends both caption and visibility, so a caption edit on a live post would trip the visibility lock. Mitigation: the conditional update allows `visibility` when it equals the current value.
- **Premium captions are public** (they are the teaser). Mitigation: add a helper line in the studio form so creators know.
- **Hidden posts with buyers.** US-020 requires `PUBLISHED` for access, so hiding blocks buyers too. That is the handoff policy (§6.2, refund policy TBD), so there's nothing to build here.
- **Feed query has no dedicated index.** Fine at MVP scale. Add a `shortcut:` comment pointing to an index on `(creator_profile_id, status, published_at)`.

## Tasks

### TASK-054: Publish / hide API and live-post edit locks

**Shared** (`packages/shared/src/posts.ts`):

```ts
/** Statuses in which visibility and media may change; live posts (PUBLISHED, PENDING_REVIEW) only allow caption edits. */
export const POST_EDITABLE_STATUSES = ['DRAFT', 'HIDDEN'] as const satisfies readonly PostStatus[];
export const isPostEditable = (status: PostStatus): boolean =>
  (POST_EDITABLE_STATUSES as readonly PostStatus[]).includes(status);
```

`packages/shared/src/errors.ts` (next to the media/offer errors):

```ts
POST_STATUS_CONFLICT: { status: 409, message: 'Status post tidak memungkinkan tindakan ini.' },
POST_LOCKED: { status: 409, message: 'Sembunyikan post dulu untuk mengubah jenis post atau media.' },
MEDIA_REQUIRED: { status: 409, message: 'Tambahkan minimal satu foto atau video sebelum mempublikasikan.' },
MEDIA_PROCESSING: { status: 409, message: 'Tunggu hingga semua video selesai diproses.' },
OFFER_REQUIRED: { status: 409, message: 'Atur harga sebelum mempublikasikan post Premium.' },
```

Update `errors.test.ts` if it snapshots or enumerates codes.

**Env** (`apps/api/src/common/env.ts`), following the `MIDTRANS_IS_PRODUCTION` string-enum style:

```ts
// TBD placeholder: when true, publishing sends posts to PENDING_REVIEW instead of PUBLISHED.
POST_MODERATION_REQUIRED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
```

Add `POST_MODERATION_REQUIRED=false` with a one-line comment to `.env.example`. Add the parse cases to `env.spec.ts` (default false, `'true'` → true, `'yes'` rejected).

**Service** (`apps/api/src/modules/posts/posts.service.ts`), inject `@Inject(ENV) env: Env`:

```ts
/** Locks the owned post row; NOT_FOUND when foreign or unknown. */
private async lockPost(tx: Prisma.TransactionClient, creatorProfileId: string, id: string) {
  const rows = await tx.$queryRaw<{ status: PostStatus; visibility: PostVisibility }[]>`
    SELECT status::text AS status, visibility::text AS visibility FROM posts
    WHERE id = ${id}::uuid AND creator_profile_id = ${creatorProfileId}::uuid
    FOR UPDATE`;
  if (rows.length === 0) throw new DomainError('NOT_FOUND');
  return rows[0]!;
}

async publish(creatorProfileId: string, id: string): Promise<StudioPost> {
  await this.prisma.$transaction(async (tx) => {
    const post = await this.lockPost(tx, creatorProfileId, id);
    if (!isPostEditable(post.status)) throw new DomainError('POST_STATUS_CONFLICT');
    const [ready, processing] = await Promise.all([
      tx.mediaAsset.count({ where: { postId: id, status: 'READY' } }),
      tx.mediaAsset.count({ where: { postId: id, status: 'PROCESSING' } }),
    ]);
    if (ready === 0) throw new DomainError('MEDIA_REQUIRED');
    if (processing > 0) throw new DomainError('MEDIA_PROCESSING');
    if (post.visibility === 'PREMIUM' && !(await tx.postOffer.findFirst({ where: { postId: id }, select: { id: true } }))) {
      throw new DomainError('OFFER_REQUIRED');
    }
    // published_at keeps the first publish time, so re-publishing a hidden post keeps its feed position.
    await tx.$executeRaw`
      UPDATE posts SET status = ${this.env.POST_MODERATION_REQUIRED ? 'PENDING_REVIEW' : 'PUBLISHED'}::post_status,
        published_at = COALESCE(published_at, now()), updated_at = now()
      WHERE id = ${id}::uuid`;
  });
  return this.get(creatorProfileId, id);
}

async hide(creatorProfileId: string, id: string): Promise<StudioPost> {
  // conditional single write: only live posts can be hidden
  const { count } = await this.prisma.post.updateMany({
    where: { id, creatorProfileId, status: { in: ['PUBLISHED', 'PENDING_REVIEW'] } },
    data: { status: 'HIDDEN' },
  });
  if (count === 0) {
    await this.get(creatorProfileId, id); // throws NOT_FOUND when foreign/unknown
    throw new DomainError('POST_STATUS_CONFLICT');
  }
  return this.get(creatorProfileId, id);
}
```

(Prisma's `updateMany` / `update` set `updated_at` via `@updatedAt`. Check how `updated_at` is maintained and match it in the raw UPDATE, or use `tx.post.update({ where: { id }, data: { status, publishedAt: … } })`. If you use that, read `published_at` in `lockPost` and pass `publishedAt: row.publishedAt ?? new Date()`. Pick whichever reads simpler.)

Change `update` so visibility respects the lock in the same single write:

```ts
const where: Prisma.PostWhereInput = { id, creatorProfileId };
// Live posts only allow caption edits; resending the current visibility (the studio form always sends it) is fine.
if (input.visibility !== undefined) {
  where.OR = [{ status: { in: [...POST_EDITABLE_STATUSES] } }, { visibility: input.visibility }];
}
const { count } = await this.prisma.post.updateMany({ where, data: input });
if (count === 0) {
  await this.get(creatorProfileId, id); // NOT_FOUND first
  throw new DomainError('POST_LOCKED');
}
```

Also add `publishedAt: string | null` to `studioPostSchema` (`z.string().nullable()`) and `toStudioPost`, so the studio can show it. Add `publishedAt: null` to the API spec expectations and web fixtures.

**Controller** (`posts.controller.ts`):

```ts
@Post(':id/publish')
@HttpCode(200)
publish(@Req() req: FastifyRequest, @Param('id', postIdPipe) id: string): Promise<StudioPost> {
  return this.posts.publish(req.creatorProfileId!, id);
}

@Post(':id/hide')
@HttpCode(200)
hide(@Req() req: FastifyRequest, @Param('id', postIdPipe) id: string): Promise<StudioPost> {
  return this.posts.hide(req.creatorProfileId!, id);
}
```

**Media locks** (`apps/api/src/modules/posts/post-media.service.ts`):

- `createUpload`: the lock query also selects `status::text AS status`. If `!isPostEditable(status)` → `POST_LOCKED` (after the NOT_FOUND check, before the limit count).
- `remove`: wrap in `$transaction`. Lock the post row (`SELECT status::text … FOR UPDATE` scoped by `creatorProfileId`; none → NOT_FOUND). Not editable → `POST_LOCKED`. Then `deleteMany({ where: { id: mediaId, postId } })`, count 0 → NOT_FOUND. Run the cleanup after commit. Replace the "arrive with US-019" comment.
- `complete`: `findOwned` includes `post: { select: { status: true } }`. If not editable → `POST_LOCKED`, but **only when the row is not already READY**, so a repeat `complete` on a READY row stays idempotent. Comment: `// shortcut: unlocked status read; a complete racing a publish can add media to the creator's own live post. Lock the post row if that matters.`
- `list` and `content` stay as they are (reads).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/posts.ts` | `POST_EDITABLE_STATUSES`, `isPostEditable`, `publishedAt` on `studioPostSchema` |
| MODIFY | `packages/shared/src/posts.test.ts` | `isPostEditable` cases |
| MODIFY | `packages/shared/src/errors.ts` | 5 new codes |
| MODIFY | `apps/api/src/common/env.ts` + `env.spec.ts` | `POST_MODERATION_REQUIRED` |
| MODIFY | `.env.example` | `POST_MODERATION_REQUIRED=false` (placeholder) |
| MODIFY | `apps/api/src/modules/posts/posts.service.ts` | `publish`, `hide`, `lockPost`, visibility lock in `update`, `publishedAt` |
| MODIFY | `apps/api/src/modules/posts/posts.controller.ts` | `POST :id/publish`, `POST :id/hide` |
| MODIFY | `apps/api/src/modules/posts/post-media.service.ts` | `POST_LOCKED` in createUpload / complete / remove (remove under post-row lock) |
| CREATE | `apps/api/src/modules/posts/post-publish.integration.spec.ts` | Integration tests (fixed id range `0190a000-0000-7000-8000-00000020…`) |
| MODIFY | `apps/api/src/modules/posts/posts.integration.spec.ts`, `post-media.integration.spec.ts`, `post-offers.integration.spec.ts` | `publishedAt: null` in expectations, if they assert whole bodies |

**Testing** (real Postgres, `app.inject`, memory storage + fake video provider overrides as in `post-media.integration.spec.ts`; insert `media_assets` / `post_offers` rows directly with Prisma where that's simpler than the upload flow):
- FREE draft with 1 READY image → publish 200, `status: PUBLISHED`, `publishedAt` set.
- Draft with no media → 409 `MEDIA_REQUIRED`. Only a PENDING_UPLOAD or REJECTED row → still `MEDIA_REQUIRED`.
- READY image + PROCESSING video → 409 `MEDIA_PROCESSING`.
- PREMIUM with media, no offer → 409 `OFFER_REQUIRED`. After a PUT offer → publish 200.
- Publish an already PUBLISHED post → 409 `POST_STATUS_CONFLICT`. Hide a DRAFT → 409 `POST_STATUS_CONFLICT`.
- Hide PUBLISHED → 200 `HIDDEN`. Re-publish → 200 `PUBLISHED`, `publishedAt` unchanged from the first publish.
- Moderation on: build the app with `overrideProvider(ENV)` set to the parsed test env plus `POST_MODERATION_REQUIRED: true`. Publish → `PENDING_REVIEW`. Hide from `PENDING_REVIEW` → `HIDDEN`.
- Live-post locks (PUBLISHED post): PATCH caption → 200. PATCH `{ caption, visibility: <same> }` → 200. PATCH `visibility: <other>` → 409 `POST_LOCKED`. POST media slot → 409 `POST_LOCKED`. DELETE media → 409 `POST_LOCKED`, row still there. After hide, all of these succeed.
- `complete` on a pending slot after publish → 409 `POST_LOCKED`. `complete` on an already READY row of a live post → 200 (idempotent).
- Concurrency: `Promise.all([publish, delete only READY media])` on a draft → never ends with a PUBLISHED post that has 0 READY media (assert the DB state: either publish 409 `MEDIA_REQUIRED` + media gone, or PUBLISHED + delete 409 `POST_LOCKED`).
- Auth/scoping: another creator's post / unknown uuid → 404, malformed id → 400, plain user → 403, no session → 401, cookie + wrong Origin → 403.
- `REMOVED` post (set via Prisma): publish and hide → 409 `POST_STATUS_CONFLICT`.

---

### TASK-055: Public posts feed endpoint

**Shared** (`packages/shared/src/posts.ts`):

```ts
/** Number of newest published posts the public feed returns. */
export const PUBLIC_FEED_LIMIT = 30;

/** Public feed item. Safe preview only: never media ids, keys or URLs. */
export const publicPostSchema = z.object({
  id: z.string(),
  visibility: z.enum(POST_VISIBILITIES),
  caption: z.string(),
  publishedAt: z.string(),
  imageCount: z.int(),
  videoCount: z.int(),
  /** Current offer terms; null for FREE posts. */
  offer: z.object({ priceCoins: z.int(), durationSeconds: z.int() }).nullable(),
});
export type PublicPost = z.infer<typeof publicPostSchema>;
export const publicPostListSchema = z.object({ posts: z.array(publicPostSchema) });
export type PublicPostList = z.infer<typeof publicPostListSchema>;
```

**API:**
- Export `PUBLIC_CREATOR` from `creator-profile.service.ts`. Don't copy it.
- New `apps/api/src/modules/posts/public-posts.service.ts` with a `PublicPostsService.list(slug)` method:
  - `prisma.creatorProfile.findFirst({ where: { slug: slug.toLowerCase(), ...PUBLIC_CREATOR }, select: { id: true } })`. None → `NOT_FOUND` (same 404 as the profile).
  - `prisma.post.findMany({ where: { creatorProfileId, status: 'PUBLISHED' }, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take: PUBLIC_FEED_LIMIT, include: { media: { where: { status: 'READY' }, select: { kind: true } }, ...currentOffer } })`. Export `currentOffer` from `posts.service.ts`.
  - Map each row: count kinds; `offer` only when `visibility === 'PREMIUM'` and an offer exists (`Number(priceCoins)`, same comment as `toStudioPost`); `publishedAt!.toISOString()`.
  - Comments: `// shortcut: newest PUBLIC_FEED_LIMIT only, add cursor pagination when creators exceed it.` and `// shortcut: no (creator_profile_id, status, published_at) index; add one if the feed query gets slow.`
- New `apps/api/src/modules/posts/public-posts.controller.ts`:

```ts
/** Public creator feed. Safe preview only; media goes through the access-checked path (US-021). */
@Controller('creators')
export class PublicPostsController {
  constructor(private readonly posts: PublicPostsService) {}

  @Get(':slug/posts')
  @Header('cache-control', 'no-store') // hidden posts must disappear immediately
  async list(@Param('slug') slug: string): Promise<PublicPostList> {
    return { posts: await this.posts.list(slug) };
  }
}
```

  Register both in `PostsModule`. `GET /creators/me/posts` (static) still wins over `:slug/posts` in find-my-way. Slugs are ≥ 3 chars, so `me` is never a slug. Add an integration assertion for this.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/posts.ts` (+ test) | `PUBLIC_FEED_LIMIT`, `publicPostSchema`, `publicPostListSchema` |
| MODIFY | `apps/api/src/modules/creators/creator-profile.service.ts` | export `PUBLIC_CREATOR` |
| MODIFY | `apps/api/src/modules/posts/posts.service.ts` | export `currentOffer` |
| CREATE | `apps/api/src/modules/posts/public-posts.service.ts` | Feed query + mapping |
| CREATE | `apps/api/src/modules/posts/public-posts.controller.ts` | `GET /creators/:slug/posts` |
| MODIFY | `apps/api/src/modules/posts/posts.module.ts` | Register controller + service |
| CREATE | `apps/api/src/modules/posts/public-posts.integration.spec.ts` | Integration tests (fixed id range `0190a000-0000-7000-8000-00000021…`) |

**Testing** (integration, rows inserted via Prisma):
- Creator with DRAFT, PUBLISHED FREE (2 READY images + 1 REJECTED), PUBLISHED PREMIUM (1 READY video, offer v1 5/604800 and v2 8/604800), HIDDEN, PENDING_REVIEW, REMOVED → feed has exactly the two PUBLISHED posts, newest `publishedAt` first. FREE: `imageCount 2, videoCount 0, offer null`. PREMIUM: `offer { priceCoins: 8, durationSeconds: 604800 }`.
- Works without a cookie; response has `cache-control: no-store`.
- **Leak check:** the serialized body contains none of the media row ids, `object_key`s, `video_uid`s, or the substrings `post-media/` / `post-video/`.
- Slug is case-insensitive (`/creators/CLAUDIA-SPEC/posts`).
- Unknown slug, PENDING_REVIEW / REJECTED creator, creator whose user is SUSPENDED → 404 `NOT_FOUND`.
- Approved creator with nothing published → `{ posts: [] }`.
- More than `PUBLIC_FEED_LIMIT` published posts → returns exactly `PUBLIC_FEED_LIMIT` (insert with `createMany`).
- `GET /creators/me/posts` with a creator session still hits the studio list.

---

### TASK-056: Studio publish / hide controls and live-post locks

**Component** `apps/web/src/app/studio/posts/[postId]/post-status-actions.tsx` (`'use client'`), props `{ post: StudioPost }`:

- If `isPostEditable(post.status)` (DRAFT/HIDDEN): "Publikasikan" button → `POST /api/v1/creators/me/posts/${id}/publish`.
- If PUBLISHED/PENDING_REVIEW: "Sembunyikan" button → `POST …/hide`, plus a line: PUBLISHED → "Post tampil di halaman publik Anda."; PENDING_REVIEW → "Menunggu tinjauan admin sebelum tampil.".
- `REMOVED` / `PROCESSING`: no buttons.
- `credentials: 'include'`, no body. On 200 → `router.refresh()`. On error → show `errorResponseSchema` `error.message` in `role="alert"`. This covers `MEDIA_REQUIRED` / `MEDIA_PROCESSING` / `OFFER_REQUIRED` messages. Disable the button while pending. Follow the fetch/error style of `post-offer-form.tsx`.

**Page** `apps/web/src/app/studio/posts/[postId]/page.tsx`: render `<PostStatusActions post={post} />` right under the "Status:" line.

**Locks in the UI** (UX only; the API enforces them):
- `post-form.tsx`: when editing and `!isPostEditable(post.status)`, disable the visibility radios and show "Sembunyikan post dulu untuk mengubah jenis post." Keep sending the current visibility (the API accepts it unchanged). Add the helper under the caption: "Caption tampil di halaman publik, termasuk untuk post Premium."
- `post-media.tsx`: add a `locked: boolean` prop. When true, hide the upload control and the Hapus buttons, and show "Sembunyikan post dulu untuk mengubah media." The page passes `locked={!isPostEditable(post.status)}`.

**Fixtures:** `studioPostSchema` gained `publishedAt`. Grep `apps/web` for StudioPost fixtures and add `publishedAt: null`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/app/studio/posts/[postId]/post-status-actions.tsx` | Publish / hide buttons |
| CREATE | `apps/web/src/app/studio/posts/[postId]/post-status-actions.test.tsx` | Component tests |
| MODIFY | `apps/web/src/app/studio/posts/[postId]/page.tsx` | Render actions, pass `locked` |
| MODIFY | `apps/web/src/app/studio/posts/post-form.tsx` (+ test) | Disabled visibility when live, caption-is-public helper |
| MODIFY | `apps/web/src/app/studio/posts/[postId]/post-media.tsx` (+ test) | `locked` prop |
| MODIFY | web StudioPost fixtures (`studio-posts.test.ts`, form tests…) | `publishedAt` |

**Testing** (Testing Library + jsdom, `fetch` mocked like `post-offer-form.test.tsx`):
- DRAFT → "Publikasikan" shown. Click → POST to `/api/v1/creators/me/posts/<id>/publish`, `router.refresh` called.
- API 409 `OFFER_REQUIRED` → its message in an alert, refresh not called.
- PUBLISHED → "Sembunyikan" + public notice. Click → POST `…/hide`. PENDING_REVIEW → review notice. REMOVED → no buttons.
- PostForm with a PUBLISHED post → visibility radios disabled + hint. Caption still editable and submits with the unchanged visibility.
- PostMedia `locked` → no file input, no Hapus buttons, hint shown.

---

### TASK-057: Public creator page — Gratis and Premium sections

**Data** `apps/web/src/lib/api/public-posts.ts`:

```ts
/** Server only. Published feed for /{creatorSlug}; uncached so hidden posts disappear immediately. Null when not found. */
export async function getPublicPosts(slug: string): Promise<PublicPostList | null> {
  const res = await fetch(`${API_ORIGIN}/${API_PREFIX}/creators/${encodeURIComponent(slug)}/posts`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /creators/:slug/posts failed: ${res.status}`);
  return publicPostListSchema.parse(await res.json());
}
```

Sends no cookies. Under `cacheComponents` an uncached fetch must sit inside `<Suspense>`. Check the bundled Next.js docs (`apps/web/AGENTS.md`) for whether `connection()` / `cache: 'no-store'` is the right request-time signal and follow them.

**Page** `apps/web/src/app/(public)/[creatorSlug]/page.tsx`: replace the "Konten" placeholder section with `<Suspense fallback={<p …>Memuat konten…</p>}><CreatorPosts slug={creator.slug} /></Suspense>`. `CreatorPosts` is an async server component in the same file, or `creator-posts.tsx` next to it:
- `getPublicPosts(slug)`. On an API error, `.catch(() => null)` renders "Konten belum bisa dimuat." (as with `LoginCta`, an outage must not break the page). If the result is null, or `posts` is empty, render the existing empty text "Belum ada konten yang dipublikasikan."
- Otherwise two sections, each rendered only when it has posts:
  - `<section aria-labelledby="gratis">` "Gratis"
  - `<section aria-labelledby="premium">` "Premium"
- Card (`<article>`, rounded border, `wrap-break-word whitespace-pre-line`): caption (or "Tanpa caption" muted), a media summary built from the counts ("2 foto · 1 video"; omit zero parts), and the date (`publishedAt` formatted `id-ID`, e.g. `3 Nov 2026`). Premium cards add a lock icon (`lucide-react` `Lock`, `aria-hidden`) + "{priceCoins} Koin · {durationSeconds / SECONDS_PER_DAY} hari" (whole days; offer always exists for a published premium post, but render nothing if null).
- No `<img>`, no media URLs. Mobile-first at 375px, single column.
- The "Langganan" section stays as it is (US-026).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/lib/api/public-posts.ts` (+ test) | Uncached feed fetch |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/page.tsx` | Suspense-wrapped feed |
| CREATE | `apps/web/src/app/(public)/[creatorSlug]/creator-posts.tsx` (+ test) | Gratis / Premium sections and cards |

**Testing:**
- `public-posts.test.ts` (mock `fetch`): 200 → parsed list; 404 → null; 500 → throws; the URL encodes the slug; no cookie header is sent.
- `creator-posts.test.tsx` (render the resolved component or a presentational child with fixture data):
  - mixed feed → "Gratis" and "Premium" headings, and each card sits under its section;
  - premium card shows "8 Koin · 7 hari";
  - "2 foto" / "1 video" summaries;
  - empty caption → "Tanpa caption";
  - only free posts → no Premium heading;
  - empty list → "Belum ada konten yang dipublikasikan.";
  - no `img` element is rendered.
- Manual UAT: publish in the studio → card appears on `/{slug}` on reload. Hide → it disappears on reload.
- `pnpm check` passes.
