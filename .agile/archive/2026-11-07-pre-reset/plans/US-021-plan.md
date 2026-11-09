# Technical Plan: US-021 — Short-Lived Media Access for Entitled Viewers

## Architecture Overview

One public endpoint, `GET /api/v1/posts/:id/media-access`, in the `entitlements` module. It resolves an **optional** session, runs `PostAccessService.check(postId, req.authSession?.userId ?? null)` (US-020, never re-implemented), and only on `full` mints short-lived URLs for the post's READY media:

- **Images** → `ObjectStorage.createDownloadUrl(key, ttl)`: R2 presigned GET (aws4fetch query signing, already used for uploads); local driver → HMAC-signed `GET /dev-storage/:prefix/:id` (mirror of the existing upload route).
- **Videos** → `VideoProvider.createPlaybackUrl(uid, ttl)`: Cloudflare Stream `POST /stream/:uid/token` (existing API token, `downloadable: false`) → iframe URL on the customer subdomain; dev stub → a storage download URL for `post-video/<uid>` played in `<video>`.
- `hidden` → 404 `NOT_FOUND`, `locked` → 403 `FORBIDDEN` (no media in the body). Free published posts go through the same path for anonymous viewers.
- TTL `MEDIA_ACCESS_TTL_SECONDS` (env, 600–1800, default 1800 — [TBD] MVP placeholder 10–30 min). Max video duration is 600 s, so one token covers a full playback. Each refresh is a new request → the access check re-runs.
- Watermark: `sha256hex(sessionId).slice(0, 8)` (pseudonymous, no personal data, stable per session); `null` for anonymous viewers.
- Rate limit with `@fastify/rate-limit` (in-memory store, per route), keyed by session-cookie hash or IP.
- One auth event log line per request: `media_access post=<id> user=<id|anon> decision=<full|locked|hidden> count=<n>` — never URLs or tokens. Request logs already drop the query string; the body is never logged.
- Web: reusable client component `PostMediaViewer` (fetch, render, watermark overlay, refresh before expiry), mounted on the studio post page as the owner preview (the first place video plays). US-014 mounts the same component on the public post page.

Decisions agreed with the user: Stream `/token` API (no signing key), `@fastify/rate-limit`, viewer mounted in the studio only.

## Dependencies

- `@fastify/rate-limit` — pin an exact version published ≥ 2 weeks ago that supports Fastify 5 (`fastify` is 5.12.7). It has no install scripts (check `pnpm install`; add to `allowBuilds` only if pnpm asks).
- New env: `MEDIA_ACCESS_TTL_SECONDS` (default 1800), `CLOUDFLARE_STREAM_CUSTOMER_CODE` (required when `VIDEO_DRIVER=stream`, added to `STREAM_VARS`). Add both to `.env.example` with placeholders (`CLOUDFLARE_STREAM_CUSTOMER_CODE=SET_LOCALLY`).
- No DB migration.

## Risks

- **Rate-limit key behind the Next proxy:** anonymous requests arrive from the web server's IP, so all anonymous visitors share one bucket. Mitigation: key logged-in users by session-cookie hash; leave a `shortcut:` comment to set Fastify `trustProxy` once the deploy topology is fixed. The in-memory store is per process (`shortcut:` → Redis store in Phase 5).
- **Stream docs drift:** follow the current official docs for the `/token` body and playback host. If they differ from this plan, follow the docs and note it in the PR. Cloudflare recommends signing keys above ~10k tokens/day → `shortcut:` comment.
- **Token expiry while paused:** a viewer that stays paused past the TTL loses segments. The viewer refreshes before expiry; refreshing swaps the video src, so a paused video restarts. Acceptable for MVP, documented.
- **Watermark ≠ protection:** documented in `docs/media-protection.md` and never claimed as DRM.
- **Rate-limit error format:** plugin errors bypass Nest's `AllExceptionsFilter`. Covered by a test asserting the standard `{ error: { code: 'RATE_LIMITED', … } }` body.

## Tasks

### TASK-071: Signed download URLs for object storage

Add a short-lived GET URL to the storage seam.

- `ObjectStorage.createDownloadUrl(key: string, expiresInSeconds: number): Promise<{ url: string; expiresAt: Date }>` in `object-storage.ts`, with the doc comment "Presigned GET for one key. Never log the URL."
- `R2ObjectStorage`: same as `createUploadUrl` but `method: 'GET'`, no headers, `X-Amz-Expires` set, `signQuery: true`.
- `LocalObjectStorage`: relative URL `/api/v1/dev-storage/<key>?exp=&sig=`, where `sig` = HMAC-SHA256 base64url over `download\n${key}\n${exp}` (a domain prefix, so upload and download tokens can't be swapped). Add `verifyDownloadToken(key, exp, sig)` (same timing-safe check as `verifyUploadToken`). Validate the key via `path(key)` inside the promise, like upload.
- `DevStorageController`: add `@Get(':prefix/:id')` → 404 unless the storage is `LocalObjectStorage`, 403 on a bad/expired token, 404 when the object is missing; else stream the bytes with the stored content type, `cache-control: private, no-store`, `x-content-type-options: nosniff`. `shortcut:` no Range support (the dev stub video plays but can't seek); dev only.
- Test fake `apps/api/test/memory-storage.ts`: `createDownloadUrl` → `memory://download/<key>` + expiresAt.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/common/object-storage.ts` | `createDownloadUrl` in the interface |
| MODIFY | `apps/api/src/common/r2-object-storage.ts` | Presigned GET |
| MODIFY | `apps/api/src/common/local-object-storage.ts` | HMAC download URL + `verifyDownloadToken` |
| MODIFY | `apps/api/src/modules/dev-storage/dev-storage.controller.ts` | Signed GET route |
| MODIFY | `apps/api/test/memory-storage.ts` | Fake `createDownloadUrl` |

**Testing:**
- `r2-object-storage.spec.ts`: URL has `X-Amz-Expires=<ttl>` and `X-Amz-Signature`, signed for GET; expiresAt ≈ now + ttl.
- `local-object-storage.spec.ts`: download token verifies; expired → false; an upload token for the same key → false (and vice versa); invalid key rejects.
- Dev-storage GET (extend its existing spec or add one): valid token → 200 bytes + stored type + `no-store` + `nosniff`; tampered/expired sig → 403; missing object → 404.

---

### TASK-072: Signed video playback URLs

- `VideoProvider.createPlaybackUrl(uid: string, expiresInSeconds: number): Promise<{ url: string; player: 'iframe' | 'video'; expiresAt: Date }>` in `video-provider.ts` ("Short-lived signed playback, no download. Never log the URL.").
- `CloudflareStreamVideoProvider`: `POST <base>/<uid>/token` with `{ exp: <unix seconds>, downloadable: false }` → parse `{ result: { token } }` with zod → `url = https://customer-<CLOUDFLARE_STREAM_CUSTOMER_CODE>.cloudflarestream.com/<token>/iframe`, `player: 'iframe'`. Errors carry the HTTP status only. `shortcut:` one API call per mint; switch to a signing key (local RS256) above ~10k tokens/day.
- `StubVideoProvider`: `storage.createDownloadUrl('post-video/' + uid, ttl)` → `player: 'video'`.
- Env (`env.ts`): `MEDIA_ACCESS_TTL_SECONDS: z.coerce.number().int().min(600).max(1800).default(1800)` (comment: [TBD] placeholder, 10–30 min); add `CLOUDFLARE_STREAM_CUSTOMER_CODE` (optional string) to `STREAM_VARS` so it's required with `VIDEO_DRIVER=stream`. Update the `CloudflareStreamVideoProvider` constructor's config check. `.env.example` placeholders.
- Test fake `apps/api/test/fake-video-provider.ts`: `createPlaybackUrl` → `{ url: 'fake://play/<uid>', player: 'iframe', expiresAt }`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/common/video-provider.ts` | `createPlaybackUrl` |
| MODIFY | `apps/api/src/common/cloudflare-stream-video-provider.ts` | `/token` call + customer URL |
| MODIFY | `apps/api/src/common/stub-video-provider.ts` | Storage download URL |
| MODIFY | `apps/api/src/common/env.ts` | `MEDIA_ACCESS_TTL_SECONDS`, customer code in `STREAM_VARS` |
| MODIFY | `.env.example` | New placeholders |
| MODIFY | `apps/api/test/fake-video-provider.ts` | Fake playback URL |

**Testing:**
- `cloudflare-stream-video-provider.spec.ts` (mock `fetch`): POSTs to `.../stream/<uid>/token` with bearer auth and body `exp` ≈ now + ttl, `downloadable: false`; returns the customer iframe URL; non-2xx → error message has the status, not the token.
- `stub-video-provider.spec.ts`: returns `player: 'video'` with the storage download URL for `post-video/<uid>`.
- `env.spec.ts`: TTL default 1800; 599 / 1801 rejected; `VIDEO_DRIVER=stream` without `CLOUDFLARE_STREAM_CUSTOMER_CODE` rejected.

---

### TASK-073: `GET /posts/:id/media-access` endpoint

**Shared (`packages/shared`):**
- `errors.ts`: `RATE_LIMITED: { status: 429, message: 'Terlalu banyak permintaan. Coba lagi sebentar.' }`.
- New `src/media-access.ts` (export from the index): 
  ```ts
  export const mediaAccessItemSchema = z.discriminatedUnion('kind', [
    z.object({ id: z.uuid(), kind: z.literal('IMAGE'), url: z.string() }),
    z.object({ id: z.uuid(), kind: z.literal('VIDEO'), url: z.string(), player: z.enum(['iframe', 'video']) }),
  ]);
  export const mediaAccessResponseSchema = z.object({
    media: z.array(mediaAccessItemSchema),
    expiresAt: z.iso.datetime(),
    watermark: z.string().nullable(),
  });
  export type MediaAccessResponse = z.infer<typeof mediaAccessResponseSchema>;
  ```
  `url` is a plain string (the local driver returns relative URLs).

**API:**
- `session.guard.ts`: `OptionalSessionGuard extends SessionGuard` → `try { await super.canActivate(ctx) } catch (err) { if (!(err instanceof DomainError && err.code === 'AUTH_REQUIRED')) throw err; } return true;` (anonymous continues with `req.authSession` undefined). Export it from `CommonModule` like `SessionGuard`.
- `app.factory.ts` `configureApp`: register `@fastify/rate-limit` **after** `@fastify/cookie` with `{ global: false, keyGenerator: (req) => req.cookies[SESSION_COOKIE] ? sha256hex(req.cookies[SESSION_COOKIE]) : req.ip, errorResponseBuilder }`. The builder must produce the standard error body (`{ error: { code: 'RATE_LIMITED', message, requestId: req.id-based X-Request-Id value, details: null } }`) with status 429. Check how the request id is read in `all-exceptions.filter.ts` and reuse that. `shortcut:` comments: per-process memory store (→ Redis store in Phase 5); `req.ip` is the proxy's IP until `trustProxy` is configured.
- `apps/api/src/modules/entitlements/media-access.controller.ts`:
  ```ts
  @Controller('posts')
  export class MediaAccessController {
    @Get(':id/media-access')
    @UseGuards(OptionalSessionGuard)
    @RouteConfig({ rateLimit: MEDIA_ACCESS_RATE_LIMIT })
    @Header('cache-control', 'no-store')
    get(@Param('id', ParseUUIDPipe) id: string, @Req() req: FastifyRequest): Promise<MediaAccessResponse>
  }
  ```
  `MEDIA_ACCESS_RATE_LIMIT = { max: 60, timeWindow: '1 minute' }` as a labeled constant ([TBD] placeholder). `RouteConfig` comes from `@nestjs/platform-fastify`. Check that the plugin reads Nest's route config; if not, follow the plugin's documented per-route config path.
- `media-access.service.ts` `MediaAccessService.mint(postId, session: AuthSession | undefined)`:
  1. `decision = await access.check(postId, session?.userId ?? null)`.
  2. Log `this.logger.log(\`media_access post=${postId} user=${session?.userId ?? 'anon'} decision=${decision} count=${n}\`)` (also for hidden/locked with count 0) — **never** the URLs.
  3. `hidden` → `DomainError('NOT_FOUND')`; `locked` → `DomainError('FORBIDDEN')`.
  4. `full`: `prisma.mediaAsset.findMany({ where: { postId, status: 'READY' }, orderBy: { createdAt: 'asc' }, select: { id, kind, objectKey, videoUid } })`. Mint all URLs in parallel with ttl = `env.MEDIA_ACCESS_TTL_SECONDS`: IMAGE → `storage.createDownloadUrl(objectKey!, ttl)`, VIDEO → `video.createPlaybackUrl(videoUid!, ttl)`.
  5. Return `{ media, expiresAt: (now + ttl).toISOString(), watermark: session ? sha256hex(session.sessionId).slice(0, 8) : null }`.
- Register the controller + service in `EntitlementsModule` (inject `ENV`, `OBJECT_STORAGE`, `VIDEO_PROVIDER` from the global `CommonModule`).
- Update the `public-posts.controller.ts` doc comment only if it now misstates where media goes (it already points to US-021).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/errors.ts` | `RATE_LIMITED` |
| CREATE | `packages/shared/src/media-access.ts` (+ index export, + `media-access.test.ts`) | Response schema |
| MODIFY | `apps/api/package.json`, `pnpm-lock.yaml` | `@fastify/rate-limit` (exact pin) |
| MODIFY | `apps/api/src/app.factory.ts` | Register rate-limit plugin |
| MODIFY | `apps/api/src/common/session.guard.ts`, `common.module.ts` | `OptionalSessionGuard` |
| CREATE | `apps/api/src/modules/entitlements/media-access.controller.ts` | Endpoint |
| CREATE | `apps/api/src/modules/entitlements/media-access.service.ts` | Check → mint → log |
| MODIFY | `apps/api/src/modules/entitlements/entitlements.module.ts` | Register |
| CREATE | `apps/api/src/modules/entitlements/media-access.integration.spec.ts` | Tests (id range `24`) |

**Testing** (`media-access.integration.spec.ts`, fixed ids `0190a000-0000-7000-8000-00000024xxxx`, `createMemoryStorage()` + `createFakeVideoProvider()` overrides, sessions created directly in the DB like the other guarded specs):
- Anonymous, published FREE post with 1 READY image + 1 READY video + 1 PENDING_UPLOAD image → 200, exactly 2 items in `createdAt` order, image `memory://download/…`, video `player: 'iframe'`, `watermark: null`, `expiresAt` ≈ now + TTL, `cache-control: no-store`; body matches `mediaAccessResponseSchema`.
- Anonymous and logged-in stranger on a published PREMIUM post → 403 `FORBIDDEN`; the body has no `media`/`url`.
- Owner on their DRAFT premium post → 200 with an 8-char hex `watermark` equal to `sha256hex(sessionId).slice(0,8)`.
- Draft/archived for anonymous, unknown uuid → 404; malformed id → 400.
- Revoked/expired session cookie on a FREE post → treated as anonymous (200, `watermark: null`); on PREMIUM → 403.
- Refresh re-checks: owner gets 200, the post is set to REMOVED, the next call → 404.
- Logging: spy on `Logger.prototype.log`. The line contains the decision and post id, and contains none of the minted URLs.
- Rate limit: 61 requests with the same cookie → the 61st is 429 with `error.code === 'RATE_LIMITED'` and a `requestId`; a different cookie is unaffected. Run this in its own `createApp` instance so the memory store doesn't affect other cases.
- `session.guard.integration.spec.ts` (or the probe pattern): `OptionalSessionGuard` sets `authSession` with a live cookie, leaves it undefined without one or with a bad one, and still rethrows non-auth errors.

---

### TASK-074: `PostMediaViewer` + studio preview + protection notes

- `apps/web/src/components/post-media-viewer.tsx` (`'use client'`), props `{ postId: string }`:
  - `fetch(\`/${API_PREFIX}/posts/${postId}/media-access\`, { cache: 'no-store' })` (same-origin via the rewrite, cookie sent automatically). Parse with `mediaAccessResponseSchema`.
  - States: loading → "Memuat media…"; 403 → "Konten ini terkunci."; 404 → "Media tidak tersedia."; 429/other → "Gagal memuat media." + a "Coba lagi" button.
  - Images: plain `<img>` (not `next/image`: the optimizer would fetch and cache signed URLs) with `alt=""`/caption-less, `draggable={false}`, `onContextMenu` preventDefault.
  - Video `player: 'iframe'` → `<iframe src={url} allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowFullScreen title="Video" />` in a 16:9 box; `player: 'video'` → `<video src={url} controls controlsList="nodownload" disablePictureInPicture onContextMenu={preventDefault} />`.
  - Watermark: when `watermark` is set, an absolutely positioned, `pointer-events-none select-none`, semi-transparent label (`influency · {watermark}`) over each item, `aria-hidden`.
  - Refresh: `setTimeout` to refetch at `expiresAt - 60 s` (min 0); clear on unmount. The refetch replaces the URLs. Never log URLs (no `console.*`).
  - Never render during SSR (the effect-based fetch keeps URLs out of the HTML).
- Studio: mount in `apps/web/src/app/studio/posts/[postId]/page.tsx` as a "Pratinjau" section below `PostMedia` when `media.media.some(m => m.status === 'READY')`. Check the `StudioMedia` field names.
- `docs/media-protection.md` (short): what is protected (server-side check, short-lived signed URLs/tokens, no download flag, never in SSR HTML/logs, rate limit), what the watermark is (pseudonymous session tag, deters casual sharing), and the explicit limits (screen recording, the URL can be reused until it expires, a paused video restarts after a refresh, no DRM).
- Update `.agile/guidelines/codebase-map.md`: endpoint row, `OptionalSessionGuard`, `RATE_LIMITED`, `createDownloadUrl`/`createPlaybackUrl` seams, env vars, the viewer component, and the pattern "media URLs only via `/posts/:id/media-access`, minted after `PostAccessService.check`".

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/components/post-media-viewer.tsx` | Viewer |
| CREATE | `apps/web/src/components/post-media-viewer.test.tsx` | Tests |
| MODIFY | `apps/web/src/app/studio/posts/[postId]/page.tsx` | Mount the "Pratinjau" section |
| CREATE | `docs/media-protection.md` | Documented limits |
| MODIFY | `.agile/guidelines/codebase-map.md` | Keep the map in sync |

**Testing** (`post-media-viewer.test.tsx`, mocked `fetch`, fake timers):
- 200 with an image, an iframe video and a `video` video → renders `<img src>`, `<iframe src>`, `<video controlsList="nodownload">`; watermark text shown.
- `watermark: null` → no watermark label.
- 403 → "Konten ini terkunci." and no media elements; 404 → "Media tidak tersedia."; 500 → error + retry refetches.
- Refresh: advancing timers to `expiresAt - 60 s` triggers a second fetch and the new URLs replace the old ones; unmount clears the timer.
