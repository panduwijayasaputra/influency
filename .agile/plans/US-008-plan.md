# Technical Plan: US-008 — PostCard with Media Carousel

## Architecture Overview

Decisions agreed with the user (2026-11-07):
- **Extend the feed API** so cards are correct from the first render.
- **Trust the web proxy** for the client IP, so guests stop sharing one media-access rate-limit bucket.

1. **A viewer-aware public feed** (`GET /creators/:slug/posts`) with an `OptionalSessionGuard`. Every `PublicPost` gains the fields that today exist only on the post detail:
   - `access: 'full' | 'locked'`
   - `viewer: { liked, canLike, canReport } | null`
   - `commentCount` (not deleted)
   - `media: { kind, durationSeconds }[]`: READY items in display order (`createdAt` asc, the same order media-access returns). Kinds and durations only, never ids, keys or URLs.

   The post detail extends `publicPostSchema`, so it gets `commentCount` and `media` too.

   Access is computed per row with the existing pure rule `decidePostAccess`, using facts loaded once per request: the creator (already resolved by slug), the viewer's admin role, and the viewer's likes on these post ids. That is 3 extra queries for the whole page, not 30.
2. **`TRUST_PROXY` env → Fastify `trustProxy`.**
   - Unset keeps today's behaviour (no trust).
   - It accepts a hop count or a comma-separated list of proxy IPs/CIDRs. `true` is rejected.
   - When set, `req.ip`, and so the anonymous rate-limit key, comes from `X-Forwarded-For`.
3. **Web `PostCard`** (client) as designed in `design/artboards/PostCard.dc.html`:
   - header: avatar, name, @slug, relative time, "Lainnya" menu
   - a fixed **4:5** media frame (no stored dimensions)
   - a CSS scroll-snap **carousel** with dots and "n/total"
   - a locked premium preview, or lazily loaded media
   - the action row
   - like count
   - a 2-line caption with Selengkapnya
4. **Media is loaded lazily per card.** When the card nears the viewport (`IntersectionObserver`, `rootMargin` 200px), it calls the existing `GET /posts/:id/media-access` from the browser.
   - URLs never enter SSR HTML or props, and they are refreshed before expiry.
   - The fetch and refresh logic is extracted from `PostMediaViewer` into a `useMediaAccess` hook that both use.
   - Locked posts never call it.
5. **The creator page "Konten" section** renders a PostCard list in place of today's 2-column grid. US-011 adds the Postingan/Grid tabs and the new Grid.

Video slides in this story render as playable media with controls (no autoplay). Muted autoplay is US-009.

## Dependencies

None new. The tools already in the repo are enough: Radix `DropdownMenu` (`radix-ui`), `BottomSheet`/`useToast`, `LikeButton`, `ReportPostButton`, `PurchaseSheet`, `PremiumCover`, and `Intl.RelativeTimeFormat`.

## Risks

- **`X-Forwarded-For` can be spoofed through the web proxy.** Next only sets XFF when the client didn't send one (`req.headers['x-forwarded-for'] ??= socket.remoteAddress`), and our rewrite forwards it unchanged.
  - With `TRUST_PROXY` set, a client sending its own XFF picks its rate-limit key, so it can evade the 60/min limit. Access checks are unaffected; the limit is only anti-scraping.
  - Mitigation: set `TRUST_PROXY` only in deployments whose edge (load balancer or CDN) overwrites XFF. Document this in `.env.example`, and in `docs/media-protection.md` next to the rate limit.
  - Locally it stays unset: one user, so a shared bucket doesn't matter.
- **Viewer-aware feed cost.** The access rule runs per row in memory, plus admin, likes and comment counts batched. The feed is still `no-store`, as today.
- **Hydration of relative time.** "2 jam lalu" depends on the current time. It renders inside `<time dateTime=… suppressHydrationWarning>` from a pure `formatRelativeTime(iso, now)`.
- **Media slots vs URLs.** The card draws slots from `post.media` (kinds), then fills them by index from media-access. Both use READY media in `createdAt` asc. If the counts differ (a race with deletion), it renders the media-access list.
- **Like on a locked premium post** stays OPEN. `canLike` already follows `PREMIUM_LIKES_WITHOUT_ACCESS`.

---

## Tasks

### TASK-020: Viewer-aware public feed (access, viewer, comment count, media kinds)

1. **Shared** (`packages/shared/src/posts.ts`):
   ```ts
   export const publicMediaSchema = z.object({ kind: z.enum(MEDIA_KINDS), durationSeconds: z.int().nullable() });
   export const publicPostViewerSchema = z.object({ liked: z.boolean(), canLike: z.boolean(), canReport: z.boolean() });
   // publicPostSchema adds:
   access: z.enum(['full', 'locked']),
   viewer: publicPostViewerSchema.nullable(),
   commentCount: z.int(),
   media: z.array(publicMediaSchema),
   ```
   - `publicPostDetailSchema` drops its own `access`/`viewer` (now inherited) and keeps `status` and the nullable `publishedAt`.
   - Keep `imageCount`/`videoCount`, which the existing UI uses.
   - Update the doc comment: still "never media ids, keys, provider ids or original URLs".
   - Rebuild shared.
2. **API controller** (`public-posts.controller.ts`): `list` gets `@UseGuards(OptionalSessionGuard)` and `@Req()`, and calls `this.posts.list(slug, req.authSession?.userId ?? null)`. It keeps `cache-control: no-store`.
3. **API service** (`public-posts.service.ts`):
   - `readyMediaKinds` → select `{ kind: true, durationSeconds: true }` with `orderBy: { createdAt: 'asc' }`.
   - Add `_count.comments` with `where: { deletedAt: null }` next to `likes` (check the relation name in `schema.prisma`).
   - `publicPostFields` maps `media`, `commentCount`, and the existing counts.
   - `list(slug, userId)`:
     - The creator query also selects `userId`. The `PUBLIC_CREATOR` filter already guarantees `creatorPublic: true`.
     - In parallel with the posts query, load `isAdmin` (a `userRole` lookup, only if `userId`) and `likedIds = new Set((await postLike.findMany({ where: { userId, postId: { in: ids } }, select: { postId: true } })).map(...))`. The like lookup runs after the posts query, because it needs the ids.
     - Per row: `access = decidePostAccess({ status, visibility, ownerUserId: creator.userId, creatorPublic: true }, userId ? { userId, isAdmin } : null)`.
     - `hidden` can't happen for PUBLISHED rows of a public creator. Assert it with `if (access === 'hidden') continue;` and a comment.
     - Then `viewer = userId ? { liked: likedIds.has(row.id), canLike: canEngage(access, row.status, env.PREMIUM_LIKES_WITHOUT_ACCESS), canReport: row.status === 'PUBLISHED' && creator.userId !== userId } : null`.
     - Reuse the exact `canReport` expression that `get()` uses. Read it, and extract a small helper if it differs.
   - `get()` returns the same new fields (`media`, `commentCount` via `publicPostFields`).
4. **Web** (`apps/web/src/lib/api/public-posts.ts`): forward the session cookie like `public-post.ts` does (`cookies()` → `SESSION_COOKIE`). Update the doc comment: the feed is viewer-aware.
   - Update every `PublicPost`/`PublicPostDetail` fixture in `apps/web` tests (grep `likeCount:`): add `access`, `viewer: null`, `commentCount: 0`, `media: []`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/posts.ts` (+ test) | feed item gains access, viewer, commentCount, media |
| MODIFY | `apps/api/src/modules/posts/public-posts.controller.ts` | OptionalSessionGuard on the list |
| MODIFY | `apps/api/src/modules/posts/public-posts.service.ts` | batched viewer facts, media kinds, comment count |
| MODIFY | `apps/api/src/modules/posts/public-posts.integration.spec.ts` (or the existing feed spec) | viewer cases |
| MODIFY | `apps/web/src/lib/api/public-posts.ts` | forward the session cookie |
| MODIFY | web test fixtures | new required fields |

**Testing** (real Postgres integration, using the existing feed spec helpers):
- **Anonymous:** FREE → `access: 'full'`, PREMIUM → `'locked'`, `viewer: null`. The JSON still contains no media ids, keys or `http` URLs other than `previewUrl` (keep or extend the existing safety assertion).
- **Owner:** every post is `'full'`, and `viewer.canReport` is `false`.
- **Admin:** PREMIUM → `'full'`.
- **Other user:** PREMIUM → `'locked'`, `canReport: true`, and `canLike` follows `PREMIUM_LIKES_WITHOUT_ACCESS` (both values).
- `viewer.liked` is `true` only on posts this user liked, and another user's like doesn't leak.
- `commentCount` excludes soft-deleted comments.
- `media` lists READY items only, oldest first, with `durationSeconds` for videos and `null` for images. PENDING, PROCESSING and FAILED items are excluded.
- Post detail: `media` and `commentCount` are present, and the existing detail tests pass.
- Shared: `publicPostSchema` rejects an item missing `access` or `media`.

---

### TASK-021: Trusted proxy for the client IP (`TRUST_PROXY`)

1. **Env** (`apps/api/src/common/env.ts`): add `TRUST_PROXY: z.string().trim().optional()`, with a `transform` to the Fastify `trustProxy` value:
   - unset or empty → `false`
   - `^\d+$` → `Number(value)` (hop count, 1–5)
   - otherwise → a comma-separated list, where each entry must be an IPv4/IPv6 address or CIDR (validate with `net.isIP` on the address part and a `/0–128` suffix) → `string[]`
   - the literal `true` is rejected with the message "TRUST_PROXY=true trusts any client; list the proxy addresses or a hop count."

   Document it in `.env.example` (placeholder commented out) with the XFF-overwrite requirement from Risks.
2. **Adapter** (`app.factory.ts`):
   - `createFastifyAdapter({ logger, logStream, trustProxy })` passes `trustProxy` to `new FastifyAdapter({ … })`.
   - `main.ts` (and wherever the app is created from env) passes `env.TRUST_PROXY`.
   - Tests keep the default (no trust).
3. **Rate limit:** no change is needed. `keyGenerator` already uses `req.authSession?.userId ?? req.ip`. Update the `shortcut:` comment in `rate-limit.guard.ts` to: `// Without TRUST_PROXY, req.ip is the web proxy's IP, so anonymous callers share one bucket; set TRUST_PROXY where the edge overwrites X-Forwarded-For.`
4. **Docs:** add one paragraph under the rate-limit section of `docs/media-protection.md`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/common/env.ts` (+ `env.spec.ts`) | parse `TRUST_PROXY` |
| MODIFY | `apps/api/src/app.factory.ts`, `apps/api/src/main.ts` | pass `trustProxy` to Fastify |
| MODIFY | `apps/api/src/common/rate-limit.guard.ts` | comment |
| MODIFY | `.env.example`, `docs/media-protection.md` | document |
| CREATE | `apps/api/src/common/trust-proxy.integration.spec.ts` | buckets per forwarded IP |

**Testing:**
- `env.spec.ts`:
  - unset → `false`; `'1'` → `1`; `'127.0.0.1, ::1'` → `['127.0.0.1', '::1']`; `'10.0.0.0/8'` → `['10.0.0.0/8']`
  - `'true'`, `'abc'` and `'999.1.1.1'` → invalid, and startup lists the variable
- `trust-proxy.integration.spec.ts`: build the app with `trustProxy: ['127.0.0.1']` and a tiny rate limit. Override `MEDIA_ACCESS_RATE_LIMIT` through the route config, or reuse the existing rate-limit spec's approach; read it first.
  - Anonymous `inject` calls with `x-forwarded-for: 203.0.113.1` until 429.
  - A call with `x-forwarded-for: 203.0.113.2` still succeeds or 404s (not 429).
  - Without `trustProxy`, the second IP is also limited (shared bucket), which pins today's behaviour.
- Manual: with the web dev server and `TRUST_PROXY=127.0.0.1,::1`, check that the API sees a client IP. A temporary `req.ip` log, removed before commit, is acceptable for the check; or rely on the integration spec, and note in the QA report what was verified.

---

### TASK-022: PostCard component

1. **`apps/web/src/lib/use-media-access.ts`** (`'use client'`): move `fetchAccess`, the state type, the retry `version` and the refresh-before-expiry timer out of `post-media-viewer.tsx` unchanged.
   ```ts
   export function useMediaAccess(postId: string, enabled: boolean): { state: MediaState; retry: () => void }
   ```
   - It does nothing while `!enabled`, and the state stays `{ kind: 'idle' }`.
   - Refactor `PostMediaViewer` to use it, keeping its behaviour and tests.
   - Also export `MediaItemView({ item, watermark })` from `post-media-viewer.tsx`: the existing per-item rendering (img with `onContextMenu` block, `<video controls playsInline>` or Stream iframe, watermark overlay), so the card reuses it.
2. **`apps/web/src/lib/relative-time.ts`**: `formatRelativeTime(iso: string, now: Date): string`.
   - It uses `Intl.RelativeTimeFormat('id', { numeric: 'auto' })` for less than 7 days (seconds → "baru saja" under 60 s, then minutes, hours, days).
   - Otherwise it falls back to `POST_DATE.format` (the Asia/Jakarta date from `premium-cover.tsx`).
   - Add a unit test with a fixed `now`.
3. **`apps/web/src/components/post-card/post-card.tsx`** (`'use client'`):
   ```ts
   type Props = { post: PublicPost; creator: { slug: string; displayName: string; avatarUrl: string | null } };
   export function PostCard({ post, creator }: Props)
   ```
   - The guest state is `post.viewer === null`. `path = \`/${creator.slug}\`` is the `returnTo` for login links, and `postHref = \`/${creator.slug}/posts/${post.id}\``.
   - **Header:** `<article aria-label={\`Post oleh ${creator.displayName}\`}>`, holding:
     - the avatar (img or initials, `size-9`)
     - name (bold) and `@{slug}` (muted)
     - `<time dateTime={post.publishedAt} suppressHydrationWarning>{formatRelativeTime(post.publishedAt, new Date())}</time>`
     - on the right, the "Lainnya" Radix `DropdownMenu` trigger (`aria-label="Lainnya"`, `MoreHorizontal` icon, `size-11`)
   - **"Lainnya" menu items:**
     - **Bagikan** shares `postHref` (absolute URL from `location.origin`).
     - **Laporkan** opens the report sheet: for a signed-in user with `viewer.canReport` only; for a guest it is a link to `loginHref(path)`; it is hidden on your own post.
     - Give `ReportPostButton` controlled `open`/`onOpenChange` props (keep its trigger mode for the post page), and render it controlled outside the menu, so the sheet doesn't unmount with the menu.
   - **Media** (`components/post-card/post-media.tsx`):
     - Frame: `relative aspect-4/5 w-full overflow-hidden bg-muted`.
     - **Locked** (`post.access === 'locked'`): reuse `<PremiumCover>` for the preview or the lock placeholder. Overlay a **Premium** chip (`bg-accent text-accent-foreground`) and a bottom bar with "n foto · n video" plus **Buka · {price} Koin**.
       - Buka for a signed-in user opens the existing `PurchaseSheet` (the same props as today's premium tile).
       - For a guest, Buka links to `loginHref(path)`.
       - The card never calls media-access.
     - **Accessible:** `const visible = useNearViewport(ref)` (an `IntersectionObserver` with `rootMargin: '200px'` that latches true once seen), then `useMediaAccess(post.id, visible)`.
       - While loading, render the skeleton slots from `post.media`.
       - When ready, render the `access.media` items with `MediaItemView`.
       - On `failed`, show "Gagal memuat media." with **Coba lagi**.
       - A PREMIUM post with full access shows a **Terbuka** chip (`bg-success-surface text-success`).
     - **Carousel** (more than one item): `<div role="region" aria-roledescription="carousel" aria-label={\`Media ${i}/${n}\`} className="flex snap-x snap-mandatory overflow-x-auto scrollbar-none">`. Each slide is `w-full shrink-0 snap-center` with `aria-roledescription="slide"`.
       - The current index comes from `onScroll` (`Math.round(scrollLeft / clientWidth)`).
       - A "n/total" pill sits top right (`bg-black/60 text-white`), and the dots sit under the frame (the active one `bg-brand`, the others `bg-border`, decorative).
       - A single item has no indicators.
   - **Action row** (`flex items-center`, every control `size-11`):
     - Left:
       - `LikeButton` (existing; pass `postId`, `path`, `likeCount`, `viewer`)
       - **Komentar** is a `Link` to `\`${postHref}#komentar\``, with `aria-label={\`Komentar, ${post.commentCount}\`}`, a `MessageCircle` icon and the count.
       - **Bagikan:** give `ShareButton` an optional `url` prop, defaulting to `window.location.href` as today, and pass the post URL.
       - **Simpan:** a `Bookmark` button whose `onClick` toasts "Segera hadir". For a guest it is a `Link` to `loginHref(path)` instead.
     - Right: **Kirim Tip**, shown only when `post.visibility === 'PREMIUM' && post.access === 'full' && post.viewer?.canReport`. `canReport` is false only on your own published post, which is the "never self-tip" rule; add that as a comment. It is a `Coins` icon plus the label "Kirim Tip" in `text-koin-foreground`, and toasts "Segera hadir".
     - For a guest, Bagikan and Kirim Tip follow the US-007 rule: links to `loginHref(path)`. Like is already a login link when `viewer` is null.
   - **Like count** stays inside `LikeButton` as today. Don't duplicate it.
   - **Caption:** a `Link` to `postHref` wrapping `<p className={expanded ? '' : 'line-clamp-2'}>`. A separate **Selengkapnya** button toggles `expanded`, and is shown only when the caption is longer than about 120 characters or contains a newline; this is a simple heuristic, so measuring isn't needed. An empty caption renders nothing.
4. **`#komentar` anchor:** add `id="komentar"` to the comments section on the post page (`CommentsSection`'s `<section>`).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/lib/use-media-access.ts` | shared fetch/refresh hook |
| MODIFY | `apps/web/src/components/post-media-viewer.tsx` (+ test) | use the hook, export `MediaItemView` |
| CREATE | `apps/web/src/lib/relative-time.ts` (+ test) | "2 jam lalu" |
| CREATE | `apps/web/src/components/post-card/post-card.tsx`, `post-media.tsx` (+ `post-card.test.tsx`) | the card |
| MODIFY | `apps/web/src/components/report-post-button.tsx` | optional controlled `open` |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/share-button.tsx` | optional `url` |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/posts/[postId]/page.tsx` | `id="komentar"` |

**Testing** (`post-card.test.tsx`; mock `fetch` for media-access and stub `IntersectionObserver` so it calls back immediately; render with `{ wrapper: Toaster }`):
- **Header:** name, `@slug`, a `<time>` with `dateTime`, and "Lainnya" opens a menu with Bagikan (and Laporkan when `canReport`).
- **Locked premium** (a guest, and a signed-in user):
  - The Premium chip, "2 foto · 1 video" and the preview `img` src equal to `previewUrl`.
  - **`fetch` is never called.**
  - Buka for a guest links to `/login?returnTo=%2Fana`; for a signed-in user it opens the dialog named after the caption.
- **Accessible FREE with 3 media:**
  - `fetch` is called once with `/api/v1/posts/{id}/media-access`.
  - It renders 3 slides, with "1/3" and the carousel region.
  - `failed` → "Coba lagi" refetches.
- **Accessible PREMIUM:** the Terbuka chip. Kirim Tip is shown when `canReport`, and absent on your own post (`canReport: false`) and for a guest.
- **Actions:**
  - Komentar → `/{slug}/posts/{id}#komentar` with the count in its label.
  - Simpan and Kirim Tip toast "Segera hadir".
  - For a guest, Simpan and Kirim Tip are login links.
- **Caption:** a long caption shows Selengkapnya, and toggling it removes `line-clamp-2`. The caption links to `postHref`.
- No media URL from the mocked media-access response appears in the server-rendered markup. Assert that `renderToString(<PostCard …/>)` from `react-dom/server` contains no `https://` URL other than `previewUrl` and `avatarUrl`.
- `relative-time.test.ts`: 30 s → "baru saja"; 5 min; 2 h → "2 jam yang lalu" (assert on the `Intl` output for `id`); 3 days; 10 days → the date.
- The existing `PostMediaViewer` tests pass after the hook extraction.

---

### TASK-023: PostCard list on the creator page, remove the old grid, docs

1. **`CreatorPosts`** (`[creatorSlug]/creator-posts.tsx`): the props become `{ creator: { slug; displayName; avatarUrl } }`. `signedIn` is dropped, because the card reads `post.viewer` (null = guest).
   - It renders `<div className="flex flex-col divide-y">{posts.map((post) => <PostCard key={post.id} post={post} creator={creator} />)}</div>`.
   - Keep the empty and outage messages unchanged ("Belum ada konten yang dipublikasikan." / "Konten belum bisa dimuat.").
2. **Creator page** (`[creatorSlug]/page.tsx` → `CreatorView`): pass `creator={{ slug, displayName, avatarUrl }}` to `CreatorPosts`.
3. **Delete** `post-grid.tsx` and its tests (the filter chips and the 2-column tiles). US-011 brings the new Grid.
   - Move the US-007 guest rule assertions to `post-card.test.tsx`: a guest's locked premium post gets a login link, not a sheet. These are already covered by TASK-022's tests, so make sure nothing is lost.
   - Keep `premium-cover.tsx`, which the card and the post page use.
4. **Docs:**
   - `frontend.md` "Purchase and paywall UX" / media: add one line saying feed cards load media lazily through `useMediaAccess` (never SSR), and locked cards never call media-access.
   - `codebase-map.md` (updated at story completion):
     - the feed fields
     - `TRUST_PROXY`
     - `PostCard`, `useMediaAccess` and `formatRelativeTime`
     - the removed `PostGrid`

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/creator-posts.tsx` (+ test) | PostCard list |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/page.tsx` (+ test) | pass the creator |
| DELETE | `apps/web/src/app/(public)/[creatorSlug]/post-grid.tsx` (+ tests) | replaced |
| MODIFY | `.agile/guidelines/frontend.md` | lazy media rule |

**Testing:**
- `creator-posts.test.tsx`: renders one `article` per post (newest first, in API order), plus the empty and outage messages. Media-access mocking isn't needed for locked-only fixtures; use one FREE post with `media: []` to check that no fetch error is shown.
- `pnpm check` green, and `pnpm --filter @influency/web build` succeeds.
- Manual check at 320–430 px:
  - A creator with free, premium and multi-media posts.
  - Swiping the carousel updates "n/total" and the dots.
  - Locked cards show the blurred preview only. Checking DevTools Network, there is no media-access call for them.
  - Free media appears as you scroll.
  - Guest actions go to `/login` and back.
  - No horizontal page scroll.
