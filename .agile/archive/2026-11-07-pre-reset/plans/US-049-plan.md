# Technical Plan: US-049 — Upload Limits & Stale Upload Cleanup

## Architecture Overview

Most of the upload pipeline exists (US-016/017). The size limits and the max duration are already labeled TBD placeholders in `packages/shared/src/post-media.ts`, and expired PENDING_UPLOAD slots already stop counting toward `POST_MEDIA_MAX_PER_POST`. This story closes the gaps recorded as `shortcut:` debt at the top of `post-media.service.ts`:

1. **One refresh path.** `PostMediaService.refresh(row, now)` decides a single row's next state: an expired PENDING_UPLOAD (any kind) is rejected with `UPLOAD_EXPIRED`; a video asks the provider. "Ready" is re-checked against the size and duration limits, and PROCESSING past `upload_expires_at + VIDEO_PROCESSING_TIMEOUT_SECONDS` is rejected with `PROCESSING_TIMEOUT`. `complete`, `list`, the sweeper and the webhook all go through it. Every transition is a conditional `updateMany` that only ever moves rows forward: PENDING_UPLOAD → PROCESSING → READY | REJECTED. READY and REJECTED are terminal, so no caller can regress a row.
2. **Cleanup only when the reject won.** `reject(row, reason)` deletes the bytes / provider video **only if its conditional update changed the row** (`count === 1`). This fixes a latent bug where a reject that lost a race with a poll making the video READY deleted a good video.
3. **Failure reason.** A nullable `media_assets.rejection_reason` enum lets the studio show why an upload failed.
4. **Sweeper (decided: in-process interval).** `MediaSweeper` runs `PostMediaService.sweep(now)` every `MEDIA_SWEEP_INTERVAL_SECONDS` (0 = off; tests use 0). It processes at most 100 stale rows per run. Conditional updates and idempotent provider deletes make it safe on several API instances. It moves to BullMQ later without changing `sweep`.
5. **Webhook (decided: re-fetch from provider).** `POST /webhooks/video/cloudflare-stream` verifies Stream's `Webhook-Signature` against `CLOUDFLARE_STREAM_WEBHOOK_SECRET` (404 when unset). It takes only the `uid` from the body, finds the row, then calls `refresh` (which asks `getStatus`). Duplicate, replayed and out-of-order events are therefore harmless. Polling on `complete`/`list` stays as the fallback.
6. **Studio (decided: re-pick + auto-remove).** The list also returns REJECTED rows (they don't count toward `n/10`). Each failed card shows the reason with **Hapus** and, on DRAFT posts, **Coba lagi**. Coba lagi opens the file picker, runs the normal upload, and deletes the failed row once the new slot is created. A REJECTED row may be deleted in any post status, since it never affects what viewers see.

Limits stay where they are (shared TBD constants, also used by the web client for early hints). No new dependency.

## Dependencies

- No new packages. Webhook HMAC uses `node:crypto` (`createHmac`, `timingSafeEqual`).
- Raw request body for the webhook: Nest's `rawBody: true` application option (gives `req.rawBody: Buffer` on `RawBodyRequest<FastifyRequest>`).
- Ops step (documented, not automated): register the webhook with Cloudflare (`PUT https://api.cloudflare.com/client/v4/accounts/{account_id}/stream/webhook` with `{ "notificationUrl": "<public API origin>/api/v1/webhooks/video/cloudflare-stream" }`). The response's `result.secret` goes into `CLOUDFLARE_STREAM_WEBHOOK_SECRET`. Verify against https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/ before implementing. If the docs differ from this plan (header name or signed string), follow the docs and note the difference in `docs/video-processing.md`.

## Risks

- **A sweep races a client `complete` / list poll.** Both sides use conditional updates from the same source states, and cleanup runs only for the winner (TASK-078 tests cover both orders).
- **A slow but legitimate Stream encode is killed by the timeout.** The timeout is a generous env placeholder (default 2 h after the slot expiry). The sweeper asks the provider once more before rejecting, and a provider error skips the row (retried next run) instead of rejecting it.
- **Webhook spoofing / replay.** HMAC with a timestamp window (±300 s), constant-time compare, and the event body is never trusted for state. A replay inside the window only triggers a provider re-read.
- **`rawBody: true` changes the JSON body parser setup app-wide.** It only adds `req.rawBody`; existing JSON specs must stay green (`pnpm check`).
- **Many API instances each run a sweeper.** The work is idempotent; at worst the provider sees duplicate deletes, which succeed.
- **Stub driver has no duration** (`durationSeconds: null`), so the duration check only applies when the provider reports one. Stream also enforces `maxDurationSeconds` at upload.

## Tasks

### TASK-077: Rejection reason, error code and env settings

**Schema** (`apps/api/prisma/schema.prisma` + new migration via `pnpm db:migrate`, name `media_rejection_reason`):

- New enum `MediaRejectionReason` → `media_rejection_reason`: `UPLOAD_EXPIRED`, `PROCESSING_TIMEOUT`, `PROCESSING_FAILED`, `TOO_LARGE`, `TOO_LONG`, `UNSUPPORTED_TYPE`.
- `MediaAsset.rejectionReason MediaRejectionReason? @map("rejection_reason")`.
- CHECK `media_assets_rejection_reason_status`: `rejection_reason IS NULL OR status = 'REJECTED'` (hand-added SQL in the migration, like earlier CHECKs). It is deliberately loose: REJECTED rows from before this story keep a null reason, and the UI shows a generic message for them.
- Index `@@index([status, uploadExpiresAt])` for the sweeper query.
- Run `pnpm --filter @influency/api generate` after the change.

**Shared** (`packages/shared/src/post-media.ts`):

- `export const MEDIA_REJECTION_REASONS = ['UPLOAD_EXPIRED', 'PROCESSING_TIMEOUT', 'PROCESSING_FAILED', 'TOO_LARGE', 'TOO_LONG', 'UNSUPPORTED_TYPE'] as const;` + `type MediaRejectionReason`.
- `studioMediaSchema` gains `rejectionReason: z.enum(MEDIA_REJECTION_REASONS).nullable()` (set only when `status === 'REJECTED'`).
- Update the doc comment on `POST_VIDEO_MAX_DURATION_SECONDS`: "enforced by the provider at upload and re-checked when ready".

**Shared errors** (`packages/shared/src/errors.ts`): add `VIDEO_TOO_LONG: { status: 422, message: 'Durasi video maksimal 10 menit.' }`. If `errors.ts` can import `post-media.ts` without an import cycle, build the existing `VIDEO_PROCESSING_FAILED` message and this new one from `POST_VIDEO_MAX_BYTES` / `POST_VIDEO_MAX_DURATION_SECONDS`. Otherwise keep them static and add a one-line comment pointing at the constants.

**Env** (`apps/api/src/common/env.ts`, `.env.example` with placeholder/commented values, `apps/api/vitest.config.ts`):

- `MEDIA_SWEEP_INTERVAL_SECONDS: z.coerce.number().int().min(0).max(3600).default(300)`: how often stale uploads are swept, 0 = off.
- `VIDEO_PROCESSING_TIMEOUT_SECONDS: z.coerce.number().int().min(600).max(86400).default(7200)`, with the comment "TBD placeholder: a video still processing this long after its upload slot expired is marked failed".
- `CLOUDFLARE_STREAM_WEBHOOK_SECRET: z.string().min(1).optional()`, with the comment "secret returned when registering the Stream webhook; unset = webhook endpoint off (polling only)".
- `vitest.config.ts` env: `MEDIA_SWEEP_INTERVAL_SECONDS: '0'`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/prisma/schema.prisma` | enum + column + index (+ migration with CHECK) |
| CREATE | `apps/api/prisma/migrations/<ts>_media_rejection_reason/migration.sql` | generated + hand-added CHECK |
| MODIFY | `packages/shared/src/post-media.ts` | `MEDIA_REJECTION_REASONS`, `studioMediaSchema.rejectionReason` |
| MODIFY | `packages/shared/src/errors.ts` | `VIDEO_TOO_LONG` |
| MODIFY | `apps/api/src/common/env.ts` | 3 new vars |
| MODIFY | `apps/api/src/common/env.spec.ts` | defaults + bounds |
| MODIFY | `.env.example` | documented placeholders |
| MODIFY | `apps/api/vitest.config.ts` | sweeper off in tests |

**Testing:**
- `env.spec.ts`: defaults (300 / 7200 / undefined); `MEDIA_SWEEP_INTERVAL_SECONDS=0` accepted; out-of-range values rejected.
- `post-media.test.ts` (shared): `studioMediaSchema` accepts `rejectionReason: null` and each enum value, and rejects unknown reasons.
- `schema-conventions.integration.spec.ts` stays green; add a DB test (in the TASK-078 spec is fine) that a non-REJECTED row with a reason violates the CHECK.

---

### TASK-078: Unified media refresh, limit checks, sweeper

All in `apps/api/src/modules/posts/post-media.service.ts` unless noted. Delete the two `shortcut:` comments above the class (abandoned uploads / stuck PROCESSING).

**`reject(row, reason): Promise<boolean>`** replaces `reject(row)`:
```ts
const { count } = await this.prisma.mediaAsset.updateMany({
  where: { id: row.id, status: { in: ['PENDING_UPLOAD', 'PROCESSING'] } },
  data: { status: 'REJECTED', rejectionReason: reason },
});
// Only the winner cleans up: a concurrent poll may have just made this video READY.
if (count === 1) this.cleanup(row);
return count === 1;
```
Existing image call sites in `complete` pass `TOO_LARGE` / `UNSUPPORTED_TYPE`.

**`refresh(row: MediaAsset, now: Date): Promise<RefreshResult>`** (private), where `type RefreshResult = { status: MediaStatus; reason?: MediaRejectionReason } | null` (`null` = provider call failed, row untouched):
1. `row.status` is READY or REJECTED → return as is (no provider call).
2. `row.status === 'PENDING_UPLOAD' && row.uploadExpiresAt <= now` → `reject(row, 'UPLOAD_EXPIRED')`, return REJECTED.
3. `row.kind === 'IMAGE'` → return PENDING_UPLOAD (images are completed only by `complete`).
4. Video: `status = await this.video.getStatus(row.videoUid!)` (let it throw; callers decide).
   - `null` or `error` → `reject(row, 'PROCESSING_FAILED')`.
   - `pending_upload` → unchanged.
   - `ready`: if `status.durationSeconds != null && status.durationSeconds > POST_VIDEO_MAX_DURATION_SECONDS` → `reject(row, 'TOO_LONG')`; else if `status.byteSize != null && status.byteSize > POST_VIDEO_MAX_BYTES` → `reject(row, 'TOO_LARGE')`; else the existing conditional READY update.
   - `processing`: if `row.uploadExpiresAt.getTime() + this.env.VIDEO_PROCESSING_TIMEOUT_SECONDS * 1000 <= now.getTime()` → `reject(row, 'PROCESSING_TIMEOUT')`; else the existing conditional PENDING_UPLOAD → PROCESSING update.
   - Return the resulting status. The caller re-reads the row when it needs it; return what was written, not a fresh read.

`applyVideoStatus` is folded into `refresh` and removed.

**`complete`**: keep the READY early return, the `POST_LOCKED` check and the REJECTED → `MEDIA_UPLOAD_MISSING` check. Then:
- Expired PENDING_UPLOAD (both kinds) → `refresh` rejects it with `UPLOAD_EXPIRED` → throw `MEDIA_UPLOAD_MISSING` (same as today).
- Video: `const result = await this.refresh(row, new Date())`. Map the result: PENDING_UPLOAD → `MEDIA_UPLOAD_MISSING`; REJECTED with reason `TOO_LONG` → `VIDEO_TOO_LONG` (`details: { maxSeconds }`), `TOO_LARGE` → `FILE_TOO_LARGE` (`details: { maxBytes: POST_VIDEO_MAX_BYTES }`), `UPLOAD_EXPIRED` → `MEDIA_UPLOAD_MISSING`, any other reason → `VIDEO_PROCESSING_FAILED`; otherwise return the re-read row.
- Image path unchanged apart from the reasons passed to `reject`.

**`list`**: select rows that need a refresh, i.e. `{ postId, OR: [{ kind: 'VIDEO', status: 'PROCESSING' }, { status: 'PENDING_UPLOAD', uploadExpiresAt: { lte: now } }] }`, and `refresh` each one in `Promise.all` with the existing per-row `.catch` warning log. Then return rows with `status in ['READY', 'PROCESSING', 'REJECTED']`, same order. Non-expired PENDING_UPLOAD stays hidden (an upload in flight).

**`remove`**: still under the post-row lock, but a REJECTED row may be removed in any post status. Change `lockEditablePost` into `lockOwnedPost(tx, creatorProfileId, postId): Promise<PostStatus>` (NOT_FOUND only) and keep `lockEditablePost` as a thin wrapper that adds the `POST_LOCKED` check, so `createUpload` is unchanged. In `remove`, call `lockOwnedPost`, load the media, and throw `POST_LOCKED` when `media.status !== 'REJECTED' && !isPostEditable(status)`. The cover-clearing logic is unchanged (a REJECTED row is never a cover).

**`toStudioMedia`**: add `rejectionReason: row.rejectionReason`.

**`sweep(now = new Date()): Promise<number>`** (public; returns the number of rows touched):
```ts
const timeoutMs = this.env.VIDEO_PROCESSING_TIMEOUT_SECONDS * 1000;
const rows = await this.prisma.mediaAsset.findMany({
  where: {
    OR: [
      { status: 'PENDING_UPLOAD', uploadExpiresAt: { lte: now } },
      { kind: 'VIDEO', status: 'PROCESSING', uploadExpiresAt: { lte: new Date(now.getTime() - timeoutMs) } },
    ],
  },
  orderBy: { uploadExpiresAt: 'asc' },
  take: SWEEP_BATCH, // const SWEEP_BATCH = 100
});
```
Then `refresh` each row sequentially (keeps provider load flat). If one row's refresh throws, log `stale media sweep failed for media <id>: <message>` (never the uid or URLs) and continue. Return the count. Not scoped to a creator: this is a system job, and it never returns data.

**`MediaSweeper`** (new `apps/api/src/modules/posts/media-sweeper.ts`, provider in `PostsModule`):
```ts
@Injectable()
export class MediaSweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(private readonly media: PostMediaService, @Inject(ENV) private readonly env: Env) {}
  onApplicationBootstrap() {
    const seconds = this.env.MEDIA_SWEEP_INTERVAL_SECONDS;
    if (seconds === 0) return;
    this.timer = setInterval(() => void this.run(), seconds * 1000);
    this.timer.unref();
  }
  onApplicationShutdown() { clearInterval(this.timer); }
  /** Skips a tick while the previous run is still going. */
  async run() { if (this.running) return; this.running = true; try { await this.media.sweep(); } catch (err) { log warn } finally { this.running = false; } }
}
```
Include the comment `// shortcut: in-process timer on every API instance (idempotent); move to a BullMQ repeatable job with the worker (Phase 5).`

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/modules/posts/post-media.service.ts` | `refresh`, `reject(reason)`, `sweep`, list/complete/remove changes, `lockOwnedPost` |
| CREATE | `apps/api/src/modules/posts/media-sweeper.ts` | interval runner |
| MODIFY | `apps/api/src/modules/posts/posts.module.ts` | register `MediaSweeper` |
| CREATE | `apps/api/src/modules/posts/media-cleanup.integration.spec.ts` | new spec, fixed ids `0190a000-0000-7000-8000-00000026xx` |
| MODIFY | `apps/api/src/modules/posts/post-media.integration.spec.ts`, `post-media-video` spec | `rejectionReason` in expectations; list now includes REJECTED |

**Testing** (`media-cleanup.integration.spec.ts`, using `createMemoryStorage()` + `createFakeVideoProvider()`; call `PostMediaService.sweep(now)` directly with a controlled `now`):
- An expired image slot with bytes uploaded → sweep → REJECTED `UPLOAD_EXPIRED`, object deleted, no longer counted (a new slot succeeds when the post was at the limit).
- An expired video slot → REJECTED `UPLOAD_EXPIRED`, `fake.deleted` contains the uid, and no `getStatus` call is needed.
- A video PROCESSING past the timeout while the provider still says `processing` → REJECTED `PROCESSING_TIMEOUT` + deleted. A video that turns `ready` at that final check → READY, not deleted.
- A video PROCESSING before the timeout → untouched.
- The provider's `getStatus` fails during the sweep (`failNext.getStatus`) → row unchanged, sweep continues with the next row, no delete.
- Ready with `durationSeconds = POST_VIDEO_MAX_DURATION_SECONDS + 1` → `complete` returns 422 `VIDEO_TOO_LONG`, row REJECTED `TOO_LONG`, provider video deleted. Same with `byteSize > POST_VIDEO_MAX_BYTES` → 413 `FILE_TOO_LARGE`, `TOO_LARGE`. At exactly the max → READY.
- **Race:** the row becomes READY (simulate with a direct DB update) between the sweep's read and its reject → reject count 0 → **not** deleted at the provider (regression test for the cleanup bug).
- Sweep twice → the second run touches 0 rows, no duplicate deletes.
- READY and REJECTED rows are never changed by a sweep.
- Batch limit: 101 stale rows → the first sweep returns 100.
- List: returns REJECTED rows with `rejectionReason`, lazily rejects the post's expired PENDING rows, and still hides in-flight PENDING rows.
- Remove: a REJECTED row on a PUBLISHED post → 204. A READY row on a PUBLISHED post → 409 `POST_LOCKED`. A foreign post → 404.
- DB CHECK: setting `rejection_reason` on a READY row fails.
- `MediaSweeper`: unit test with fake timers. Interval 0 → no timer; interval > 0 → `sweep` called per tick; an overlapping tick is skipped; a thrown error is logged and doesn't stop the timer.

---

### TASK-079: Verified Cloudflare Stream processing webhook

**Signature check** (new pure module `apps/api/src/common/stream-webhook.ts`):
```ts
/** Cloudflare Stream `Webhook-Signature: time=<unix s>,sig1=<hex HMAC-SHA256(secret, `${time}.${rawBody}`)>`. */
export const STREAM_WEBHOOK_TOLERANCE_SECONDS = 300;
export function verifyStreamWebhook(rawBody: Buffer, header: string | undefined, secret: string, now: Date): boolean
```
- Parse `time` and `sig1` from the comma-separated `k=v` pairs. A missing or non-numeric `time` or a missing `sig1` → false.
- `|now/1000 - time| > TOLERANCE` → false (replay window).
- Compare with `timingSafeEqual` on equal-length buffers (length mismatch → false).

**Raw body:** pass `rawBody: true` to `NestFactory.create` in `createApp` (`apps/api/src/app.factory.ts`). The webhook spec builds its app the same way (`createNestApplication(createFastifyAdapter(...), { rawBody: true })`).

**Controller** (new `apps/api/src/modules/posts/video-webhook.controller.ts`, registered in `PostsModule`):
- `@Controller('webhooks/video')`, `@Post('cloudflare-stream')`, `@HttpCode(200)`. No session guard; the global `CsrfGuard` lets cookieless requests through.
- `const secret = env.CLOUDFLARE_STREAM_WEBHOOK_SECRET`. If it is unset → throw `DomainError('NOT_FOUND')`.
- `verifyStreamWebhook(req.rawBody!, req.headers['webhook-signature'], secret, new Date())` fails → `DomainError('FORBIDDEN')`.
- Parse the body with `z.object({ uid: z.string().regex(/^[A-Za-z0-9]{1,64}$/) })` (passthrough; other fields ignored). Invalid → 400 via `ZodValidationPipe`. Validate after the signature check: parse `req.body` in the handler, not as a pipe on `@Body`.
- `await postMedia.handleVideoEvent(uid)` → `200 {}`.
- Log `stream webhook for media <id>` (or `unknown video`) only, never the uid or body.

**Service** (`PostMediaService.handleVideoEvent(uid: string): Promise<void>`):
- `findUnique({ where: { videoUid: uid } })`. Unknown → return (acknowledged, so Stream stops retrying).
- `await this.refresh(row, new Date())`. A provider error propagates → 500, which lets Stream retry; polling and the sweeper are the fallback.
- No creator scoping (system event); returns nothing.

**Docs:** new `docs/video-processing.md` (short): the upload states and what moves them (`complete` / list polling / webhook / sweeper), the rejection reasons, the env vars from TASK-077, and the webhook registration `curl` (placeholders only) with the docs link. Add a pointer to it in `.env.example` next to the secret.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/common/stream-webhook.ts` | `verifyStreamWebhook` |
| CREATE | `apps/api/src/common/stream-webhook.spec.ts` | unit tests |
| MODIFY | `apps/api/src/app.factory.ts` | `rawBody: true` |
| CREATE | `apps/api/src/modules/posts/video-webhook.controller.ts` | endpoint |
| MODIFY | `apps/api/src/modules/posts/posts.module.ts` | register controller |
| MODIFY | `apps/api/src/modules/posts/post-media.service.ts` | `handleVideoEvent` |
| CREATE | `apps/api/src/modules/posts/video-webhook.integration.spec.ts` | fixed ids `…00000027xx` |
| CREATE | `docs/video-processing.md` | ops + state docs |
| MODIFY | `.env.example` | pointer |

**Testing:**
- Unit (`stream-webhook.spec.ts`): valid signature → true; tampered body, wrong secret, wrong `sig1`, missing header, malformed header, `time` 301 s in the past or future → false; different-length signature → false (no throw).
- Integration (override `ENV` with a secret, fake video provider, sign requests in the test with the same HMAC):
  - Secret unset → 404.
  - Bad or stale signature → 403, and the row is unchanged.
  - A valid event for a PROCESSING row whose provider state is `ready` → 200, row READY with duration.
  - A duplicate of the same event → 200, row still READY, no extra writes (`updatedAt` unchanged).
  - Out of order: a `ready` event applied, then an older event replayed while the provider state is set back to `processing` → row stays READY.
  - Provider `error` → REJECTED `PROCESSING_FAILED` + provider delete.
  - An event for an expired PENDING_UPLOAD row → REJECTED `UPLOAD_EXPIRED`.
  - An event for a REJECTED row while the provider says `ready` → stays REJECTED.
  - Unknown uid → 200, nothing changed.
  - Valid signature but a body without `uid` → 400.
  - A request that carries a session cookie and a foreign Origin is still rejected by CSRF (403); document that Stream never sends cookies.
- Existing JSON endpoint specs stay green with `rawBody: true`.

---

### TASK-080: Failed uploads in the studio (Hapus / Coba lagi)

`apps/web/src/app/studio/posts/[postId]/post-media.tsx` (+ `apps/web/src/app/studio/posts/labels.ts`):

- `labels.ts`: `MEDIA_REJECTION_LABELS: Record<MediaRejectionReason, string>`:
  - `UPLOAD_EXPIRED`: "Unggahan tidak selesai tepat waktu."
  - `PROCESSING_TIMEOUT`: "Pemrosesan video terlalu lama."
  - `PROCESSING_FAILED`: "Video tidak dapat diproses."
  - `TOO_LARGE`: "Ukuran file melebihi batas."
  - `TOO_LONG`: "Durasi video melebihi batas."
  - `UNSUPPORTED_TYPE`: "Format file tidak didukung."
  - Null reason (legacy rows): "Unggahan gagal."
- `const active = media.filter((m) => m.status !== 'REJECTED')`. Use `active` for `full` and the `n/{POST_MEDIA_MAX_PER_POST}` counter. `processing` is unchanged.
- Failed cards render in the same grid: kind icon/label, "Gagal" badge, the reason text, a **Hapus** button (always, including live posts, since the API allows it) and, when not `locked`, a **Coba lagi** button. No thumbnail, and no "Jadikan sampul".
- Coba lagi: store `retryOf = item.id` in state and open the existing hidden file input (`inputRef.current?.click()`). In `upload`, once the slot response is OK and `retryOf` is set, fire `DELETE ${base}/${retryOf}` (await it, ignore failure: the row is already harmless) and clear `retryOf`. Clear `retryOf` too when the picker yields no file or the client-side check fails.
- Keep the existing API error messages for `complete`. The new `VIDEO_TOO_LONG` message comes from the API via `apiMessage`.
- `page.tsx`: no change (the "Pratinjau" gate already checks READY).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/app/studio/posts/[postId]/post-media.tsx` | failed cards, count, retry |
| MODIFY | `apps/web/src/app/studio/posts/labels.ts` | reason labels |
| MODIFY | `apps/web/src/app/studio/posts/[postId]/post-media.test.tsx` | tests |

**Testing** (Testing Library, mocked `fetch`):
- A REJECTED item renders "Gagal" + its reason label. A null reason → "Unggahan gagal."
- REJECTED items don't count: 10 READY + 1 REJECTED → full; 9 READY + 3 REJECTED → upload enabled, counter `9/10`.
- Hapus on a failed card → `DELETE …/media/:id`, then refresh. It is shown when `locked`, while Coba lagi is hidden when `locked`.
- Coba lagi → choosing a file → POST slot → `DELETE` of the failed id after the slot succeeds → PUT → complete. A slot failure (e.g. 409) → no DELETE, error message shown.
- Coba lagi then cancelling the picker → no request, and a later normal upload doesn't delete anything.
