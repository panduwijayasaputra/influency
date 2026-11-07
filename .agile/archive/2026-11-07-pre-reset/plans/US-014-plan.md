# Technical Plan: US-014 — Post Detail & Paywall Preview

## Architecture Overview

This is a thin story: US-020 (access check), US-048 (blurred preview) and US-021 (media access + `PostMediaViewer`) supply all the hard parts. US-014 adds one public endpoint and one page that wire them together.

- **API** `GET /api/v1/creators/:slug/posts/:postId` (`OptionalSessionGuard`, `cache-control: no-store`). It calls `PostAccessService.check(postId, req.authSession?.userId ?? null)`:
  - `hidden` → 404 `NOT_FOUND`. This covers draft, archived and removed posts, unknown or malformed ids, non-public creators, and a post belonging to another slug.
  - Otherwise it returns `PublicPostDetail` = the feed item shape + `status` + `access: 'full' | 'locked'`.
  - It never references media: no keys, ids or URLs. Media still loads only through `GET /posts/:id/media-access`.
- **Web** `/{creatorSlug}/posts/{postId}` (SSR, forwards the session cookie when present):
  - `full`: caption, date and `<PostMediaViewer postId>` (client-side fetch, so no signed URLs in the server-rendered HTML). A PREMIUM post with `full` also shows a **"Sudah terbuka"** badge.
  - `locked`: the generated blurred preview (or the locked placeholder) and **"{price} Koin · akses permanen"**. Logged-out visitors get **"Masuk untuk membuka"**, which goes to login and returns to this post. Logged-in visitors see the price only (US-025 adds the buy button).
  - Not found: a post-level `not-found.tsx`.
  - Feed cards link to the detail page.

Decisions agreed with the user (2026-11-04):

1. **Paywall CTA before US-025:** login link for logged-out visitors, price only for logged-in visitors. No disabled "coming soon" button.
2. **Subscription option:** left out until US-026/US-027. That AC stays open until then; US-027 adds it to this page.
3. **Owner/admin viewing a non-published post at the public URL:** follows the single access rule (`full`), and the page shows a status label ("Draf", "Diarsipkan", …) so it is clearly not public. `publishedAt` is therefore nullable in the detail response.

AC 4's "archived posts stay reachable for entitled users through their library" comes from US-050 (archive grants) and US-029 (library). Once US-050 extends `decidePostAccess`, this endpoint and page pick it up with no change here.

## Dependencies

- Existing: `PostAccessService` (`apps/api/src/modules/entitlements/post-access.service.ts`, exported by `EntitlementsModule`), `OptionalSessionGuard` (`apps/api/src/common/session.guard.ts`), `PublicPostsService` / `PublicPostsController`, `currentOffer` + `previewId` (`posts.service.ts`), `PostMediaViewer` (`apps/web/src/components/post-media-viewer.tsx`), `loginHref` (`apps/web/src/lib/login-href.ts`), `getCurrentUser`, `POST_STATUS_LABELS` (`apps/web/src/app/studio/posts/labels.ts`).
- No new packages, no migration.

## Risks

- **Signed URLs or media references leaking into SSR HTML.** Mitigation: the detail endpoint returns no media fields, and the page renders media only through the client `PostMediaViewer`. The API test asserts the response contains no media id, object key or video uid.
- **A client value used as `userId`.** Mitigation: the controller passes only `req.authSession?.userId ?? null`. QA checks this.
- **Owner/admin `full` responses cached publicly.** Mitigation: `cache-control: no-store` on the endpoint, and the page reads cookies, so it is dynamic.
- **Two access paths drifting apart.** The page decides `full` vs `locked` from the detail response, while media-access re-checks on its own. Both call the same `PostAccessService.check`, so they cannot disagree except across a status change in between. In that case media-access wins, and `PostMediaViewer` already shows "Konten ini terkunci." / "Media tidak tersedia.".
- **The uncommitted US-020/021/048 work on `dev` is still moving.** The dev agent must re-read `public-posts.service.ts` and `post-media-viewer.tsx` before editing.

## Tasks

### TASK-075: Public post detail endpoint

**Shared** — `packages/shared/src/posts.ts`, next to `publicPostSchema`:

```ts
/** GET /creators/:slug/posts/:postId. Like the feed item (no media refs); owner/admin may see non-published posts. */
export const publicPostDetailSchema = publicPostSchema.extend({
  status: z.enum(POST_STATUSES),
  /** null only for a never-published post, visible to its owner/admin. */
  publishedAt: z.string().nullable(),
  /** full = show PostMediaViewer; locked = paywall preview. (hidden is a 404.) */
  access: z.enum(['full', 'locked']),
});
export type PublicPostDetail = z.infer<typeof publicPostDetailSchema>;
```

Add schema tests to `packages/shared/src/posts.test.ts`: accepts a locked premium item and a full draft with `publishedAt: null`, and rejects `access: 'hidden'`.

**Service** — `apps/api/src/modules/posts/public-posts.service.ts`:

- Inject `PostAccessService`.
- Extract the per-row mapping in `list()` into a module-level function `publicPostFields(row, slug)` that returns every `PublicPost` field except `publishedAt`. `list()` becomes `{ ...publicPostFields(row, creator.slug), publishedAt: row.publishedAt!.toISOString() }`, with unchanged behaviour (the existing feed tests must still pass).
- New method:

```ts
/** One post for /{slug}/posts/{postId}. hidden (incl. wrong slug / malformed id) → NOT_FOUND. userId from the session only. */
async get(slug: string, postId: string, userId: string | null): Promise<PublicPostDetail> {
  if (!z.uuid().safeParse(postId).success) throw new DomainError('NOT_FOUND');
  const access = await this.access.check(postId, userId);
  if (access === 'hidden') throw new DomainError('NOT_FOUND');
  const row = await this.prisma.post.findFirst({
    where: { id: postId, creatorProfile: { slug: slug.toLowerCase() } },
    include: { media: { where: { status: 'READY' }, select: { kind: true } }, creatorProfile: { select: { slug: true } }, ...currentOffer },
  });
  if (!row) throw new DomainError('NOT_FOUND');
  return {
    ...publicPostFields(row, row.creatorProfile.slug),
    status: row.status,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    access,
  };
}
```

  Do not add `PUBLIC_CREATOR` to the slug filter: `check()` already hides posts of non-public creators from everyone except the owner and admins.

**Controller** — `apps/api/src/modules/posts/public-posts.controller.ts`:

```ts
@Get(':slug/posts/:postId')
@UseGuards(OptionalSessionGuard)
@Header('cache-control', 'no-store') // owner/admin see non-public posts; status changes must show immediately
get(@Param('slug') slug: string, @Param('postId') postId: string, @Req() req: FastifyRequest): Promise<PublicPostDetail> {
  return this.posts.get(slug, postId, req.authSession?.userId ?? null);
}
```

**Module** — `apps/api/src/modules/posts/posts.module.ts`: add `imports: [EntitlementsModule]`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/posts.ts` | `publicPostDetailSchema` / `PublicPostDetail` |
| MODIFY | `packages/shared/src/posts.test.ts` | schema tests |
| MODIFY | `apps/api/src/modules/posts/public-posts.service.ts` | `publicPostFields` helper + `get()` |
| MODIFY | `apps/api/src/modules/posts/public-posts.controller.ts` | `GET :slug/posts/:postId` |
| MODIFY | `apps/api/src/modules/posts/posts.module.ts` | import `EntitlementsModule` |
| CREATE | `apps/api/src/modules/posts/public-post-detail.integration.spec.ts` | integration tests |

**Testing** (`public-post-detail.integration.spec.ts`, real Postgres via `createApp`, following the fixture style of `public-posts.integration.spec.ts`: fixed user ids `0190a000-0000-7000-8000-0000001400NN`, sessions via `sha256hex(token)`, cleanup in `afterAll`). Parse every 200 body with `publicPostDetailSchema`.

- Anonymous, FREE published → 200, `access: 'full'`, `offer: null`, `previewUrl: null`, correct counts (READY media only).
- Anonymous, PREMIUM published with offers v1/v2 and a `previewKey` → `access: 'locked'`, `offer.priceCoins` = latest version, `previewUrl` matches the feed's URL. The serialized body does not contain any media id, `objectKey` or `videoUid`.
- Logged-in stranger on the premium post → `locked`.
- Owner on the premium post → `full`. Owner on their DRAFT → `full`, `status: 'DRAFT'`, `publishedAt: null`. Owner on their ARCHIVED → `full`.
- Admin on a REMOVED post → `full`. Owner on their REMOVED post → 404.
- Anonymous on DRAFT, ARCHIVED, PENDING_REVIEW, REMOVED → 404 `NOT_FOUND` (error shape via `errorResponseSchema`).
- Published post of a suspended-user creator → 404.
- Correct post id with another creator's slug → 404. Slug in a different case (`Feed-Spec-…`) → 200.
- Malformed post id (`not-a-uuid`) → 404 (not 400/500). Unknown uuid → 404.
- Expired session cookie on a FREE post → 200 `full` (treated as anonymous, no 401).
- Response has `cache-control: no-store`.
- Existing `public-posts.integration.spec.ts` still passes (helper refactor).

---

### TASK-076: Public post detail page & feed links

**API client** — create `apps/web/src/lib/api/public-post.ts`:

```ts
/** Server only. One post for /{slug}/posts/{postId}, or null on 404. Forwards the session cookie when present (owner/entitled viewers get `full`). */
export async function getPublicPost(slug: string, postId: string): Promise<PublicPostDetail | null>
```

It uses `fetch(`${API_ORIGIN}/${API_PREFIX}/creators/${encodeURIComponent(slug)}/posts/${encodeURIComponent(postId)}`, { cache: 'no-store', headers })`. `headers` contains `cookie: `${SESSION_COOKIE}=${token}`` only when `(await cookies()).get(SESSION_COOKIE)` exists, the same forwarding as `getAsCreator` in `studio-posts.ts`, but without returning null when logged out. 404 → `null`; other non-OK → `throw new Error(...)`; parse with `publicPostDetailSchema`. Add `public-post.test.ts` following `public-posts.test.ts`: encodes params, null on 404, throws on 500 and on schema mismatch, sends the cookie only when present.

**Shared UI** — move `PremiumCover` (and its `Lock` import) from `creator-posts.tsx` into `apps/web/src/app/(public)/[creatorSlug]/premium-cover.tsx` (exported, unchanged markup), and import it in both places. Also export the `DATE` formatter from that file or a sibling, rather than duplicating it.

**Feed links** — in `creator-posts.tsx` `PostCard`, wrap the card content in `<Link href={`/${slug}/posts/${post.id}`}>` (pass `slug` down through `PostSection`), keeping the `<article>` and adding a visible focus style (`focus-visible:ring`). Update `creator-posts.test.tsx`: every card links to its detail path.

**Page** — create `apps/web/src/app/(public)/[creatorSlug]/posts/[postId]/page.tsx` (server component):

- `const { creatorSlug, postId } = await params`. Fetch `getPublicCreator(creatorSlug)` and `getPublicPost(creatorSlug, postId)` in parallel. If either is null → `notFound()`. Unlike the feed, an API error here propagates to the error boundary: there is nothing useful to show without the post.
- `generateMetadata`: title `"${creator.displayName} · Postingan"` and description = first 160 chars of the caption (already public in the feed), falling back to `${creator.displayName} di ${APP_NAME}`. No images in metadata: the link preview must never carry premium media. Add `robots: { index: false }` when `post.status !== 'PUBLISHED'`.
- Layout (mobile-first, `max-w-2xl`, matches the creator page): a back link "← {displayName}" to `/${creator.slug}`; a status label when `post.status !== 'PUBLISHED'` using `POST_STATUS_LABELS` (import from `@/app/studio/posts/labels`); caption (or "Tanpa caption"); date (`publishedAt` formatted Asia/Jakarta, omitted when null) and media summary.
- `access === 'full'`: `<PostMediaViewer postId={post.id} />`; if `post.visibility === 'PREMIUM'`, a badge with an unlock icon: **"Sudah terbuka"**.
- `access === 'locked'`: `<PremiumCover previewUrl={post.previewUrl} />`, then `{post.offer.priceCoins} Koin · akses permanen` (the offer always exists for a published premium post; render the price line only when `post.offer` is non-null). Then `<Suspense fallback={null}><UnlockCta path={`/${creator.slug}/posts/${post.id}`} /></Suspense>`, where `UnlockCta` follows `LoginCta` on the creator page: `getCurrentUser().catch(() => null)`. When logged out → `<Button asChild><Link href={loginHref(path)}>Masuk untuk membuka</Link></Button>`; when logged in → `null`, with the comment `// US-025 adds the Koin unlock button here; US-027 adds the subscription option.`
- Never pass media URLs, keys or tokens as props.

**Not found** — create `apps/web/src/app/(public)/[creatorSlug]/posts/[postId]/not-found.tsx`: "Postingan tidak ditemukan" / "Postingan ini tidak ada atau tidak tersedia untuk umum.", plus a button back to `/` (same style as the creator `not-found.tsx`).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/lib/api/public-post.ts` | `getPublicPost` |
| CREATE | `apps/web/src/lib/api/public-post.test.ts` | client tests |
| CREATE | `apps/web/src/app/(public)/[creatorSlug]/premium-cover.tsx` | shared `PremiumCover` + date formatter |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/creator-posts.tsx` | use shared cover, link cards to detail |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/creator-posts.test.tsx` | link assertions |
| CREATE | `apps/web/src/app/(public)/[creatorSlug]/posts/[postId]/page.tsx` | detail page + `UnlockCta` |
| CREATE | `apps/web/src/app/(public)/[creatorSlug]/posts/[postId]/page.test.tsx` | page tests |
| CREATE | `apps/web/src/app/(public)/[creatorSlug]/posts/[postId]/not-found.tsx` | post 404 |

**Testing** (`page.test.tsx`, Vitest + Testing Library, mocking `getPublicCreator`, `getPublicPost`, `getCurrentUser` and `PostMediaViewer` the way `page.test.tsx` of the creator page mocks its data):

- FREE `full`: renders the caption and `PostMediaViewer` with the post id, no price, no "Sudah terbuka".
- PREMIUM `full`: viewer + "Sudah terbuka", no price CTA.
- PREMIUM `locked` with `previewUrl`: renders an `<img src={previewUrl}>`, "8 Koin · akses permanen", no `PostMediaViewer`.
- PREMIUM `locked` with no preview → `locked-placeholder`.
- `UnlockCta`: logged out → link "Masuk untuk membuka" with `href = loginHref('/ana/posts/<id>')`; logged in → renders nothing.
- Owner DRAFT `full` with `publishedAt: null`: shows the "Draf" label and no date.
- `getPublicPost` → null, or `getPublicCreator` → null: `notFound()` is called.
- The back link points to `/{slug}`.

No Playwright: e2e is not set up in `apps/web` yet (US-045 covers the end-to-end journey).
