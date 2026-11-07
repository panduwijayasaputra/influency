# Technical Plan: US-017 — Upload Video to Posts

## Architecture Overview

Agreed with the user:

- **Same media pipeline as US-016.** Video goes through the existing `/creators/me/posts/:postId/media` routes and `media_assets` table; the kind is derived from the declared content type. Slot → browser uploads straight to the provider → `complete`.
- **`VideoProvider` seam with two drivers**, selected by `VIDEO_DRIVER=stub|stream` (default `stub`; `stub` is rejected when `NODE_ENV=production`, like `STORAGE_DRIVER=local`).
  - `stream` = Cloudflare Stream **direct creator upload** (`POST /accounts/{id}/stream/direct_upload` with `requireSignedURLs: true`). The browser POSTs `multipart/form-data` (field `file`) to the one-time `uploadURL`.
  - `stub` = stores the upload privately through the existing `ObjectStorage` (`post-video/<uuid>`, presigned PUT; local or R2), validates magic bytes (MP4/MOV `ftyp`, WebM EBML) and reports `processing` for ~5 s before `ready`, so the processing UI is real in dev. A tiny committed fixture `apps/api/test/fixtures/sample.mp4` is used by tests (and later the US-044 seed).
- **Processing status = lazy polling.** `complete` moves the row to `PROCESSING` (or straight to `READY`). `list` re-asks the provider for every `PROCESSING` video; the studio page calls `router.refresh()` every 5 s while one is processing. No webhook (deferred with the worker, Phase 5).
- **No owner playback in US-017.** The studio shows a video card with status / duration / delete. Signed playback tokens (Stream signing keys + short-lived JWT) are US-021, for owners and buyers alike. The `content` route returns `NOT_FOUND` for videos.
- **Limits (TBD placeholders, shared constants):** MP4 / MOV / WebM, ≤ 200 MiB (Stream basic-upload ceiling), ≤ 600 s; videos count toward the existing `POST_MEDIA_MAX_PER_POST` (10). Video slot TTL `VIDEO_UPLOAD_TTL_SECONDS` (default 1800; large uploads outlast the 300 s image TTL).

```
Browser                       API                                     Stream (or stub → ObjectStorage)
  │ POST …/posts/:id/media {contentType: video/mp4, byteSize}
  │─────────────────────────▶ owner check, limits, lock post row
  │                           provider.createUpload ────────────────▶ direct_upload {requireSignedURLs, maxDurationSeconds, expiry}
  │                           insert VIDEO / PENDING_UPLOAD, video_uid ◀─ {uid, uploadURL}
  │◀───────────────────────── {media, upload:{url, method: POST, formField: 'file', headers: {}}}
  │ POST url (multipart, field file) ─────────────────────────────────▶ (stub: PUT presigned dev-storage URL)
  │ POST …/media/:mediaId/complete
  │─────────────────────────▶ provider.getStatus(uid)
  │                           pending_upload → 409 MEDIA_UPLOAD_MISSING
  │                           processing → PROCESSING · ready → READY (+duration, size)
  │                           error → REJECTED, provider.delete, 422 VIDEO_PROCESSING_FAILED
  │ GET …/media (every 5 s while PROCESSING) → re-checks PROCESSING rows
```

AC mapping:

| Acceptance criterion | How |
|---|---|
| Creator uploads video through an adapter targeting private Stream | `VideoProvider` + `CloudflareStreamVideoProvider` (direct creator upload); same owner-scoped routes/guards as US-016 |
| Post shows processing status until ready | `MediaStatus.PROCESSING`; `complete`/`list` sync from provider; studio badge "Memproses…" + 5 s refresh |
| Stub adapter + protected fixture without Stream credentials | `VIDEO_DRIVER=stub` (default) → `StubVideoProvider` on private `ObjectStorage`; fixture `test/fixtures/sample.mp4` uploaded through the private path in tests, never served statically |
| Originals never public without a signed token | Stream uploads always `requireSignedURLs: true`; `video_uid` and provider URLs never leave the API (not in `StudioMedia`); no playback route until US-021 mints signed tokens; stub bytes stay in the private bucket/dir with no read route for videos |

Out of scope (owned elsewhere): playback / signed tokens (US-021), Stream webhook + stuck-`PROCESSING` sweeper + abandoned-upload cleanup (worker, Phase 5), blocking publish while media is `PROCESSING` (US-019 — flag it there), thumbnails/posters, tus resumable uploads > 200 MiB, upload progress bar.

## Dependencies

- None new. Cloudflare Stream REST via `fetch`; zod for response parsing.
- **Live Stream only:** an API token with `Stream:Edit`; `CLOUDFLARE_STREAM_ACCOUNT_ID`, `CLOUDFLARE_STREAM_TOKEN` (handoff §9 names). Documented in README.
- `ffmpeg` once, locally, to generate the fixture (or any ≤ 50 KB valid MP4).

## Risks

- **Stream API details:** verify against current docs before coding — [Direct creator uploads](https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/), [Video details / status states](https://developers.cloudflare.com/api/resources/stream/), [Securing your Stream](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/). Expected: `direct_upload` body `{ maxDurationSeconds, expiry, requireSignedURLs }` → `result.{uid, uploadURL}`; `GET /stream/{uid}` → `result.{readyToStream, status.state, duration, size}`; states `pendingupload | downloading | queued | inprogress | ready | error`; `expiry` between 2 min and 6 h. If the docs disagree, follow the docs and note it here.
- **Enum + CHECK in one migration fails** (Postgres: a value added by `ALTER TYPE … ADD VALUE` can't be used in the same transaction). Use two migrations: enum values first, then columns + CHECK.
- **Stub with big files:** dev-storage PUT buffers the body in memory (200 MiB) and goes through the Next `/api/v1` rewrite. Dev verifies a ~50 MiB upload locally; if Next caps it, document "use small videos with the stub" in README. The stub downloads the object once to check magic bytes (fine for dev).
- **Stub presigned URL stays valid after validation** (US-016 QA issue) — dev-only driver, `shortcut:` comment. Stream upload URLs are one-time.
- **`PROCESSING` forever** if Stream never finishes: row keeps counting toward the limit; creator can delete it. `shortcut:` comment → sweeper with the worker.
- **`object_key` becomes nullable:** image code paths must assert it; TypeScript will flag every use.
- **Fixed test ids:** use the next free range `0190a000-0000-7000-8000-0000001e…`.

## Tasks

### TASK-048: Video schema, migrations and shared media contract

**Prisma** (`apps/api/prisma/schema.prisma`):

```prisma
/// US-016 images; US-017 video (Cloudflare Stream or the stub driver).
enum MediaKind {
  IMAGE
  VIDEO
  @@map("media_kind")
}

enum MediaStatus {
  PENDING_UPLOAD
  /// Video uploaded, provider still transcoding (US-017).
  PROCESSING
  READY
  REJECTED
  @@map("media_status")
}

model MediaAsset {
  …
  /// IMAGE only: server-generated `post-media/<uuid>`; never from the client.
  objectKey       String?     @unique @map("object_key")
  /// VIDEO only: provider video id (Stream uid / stub uuid). Never returned to clients.
  videoUid        String?     @unique @map("video_uid")
  /// VIDEO only, once READY and the provider knows it.
  durationSeconds Int?        @map("duration_seconds")
  …
}
```

Update the model doc comment: "Media attached to a post (US-016 images, US-017 video). Bytes live in private storage / Stream; the API decides access. CHECK: media_assets_storage_ref."

Migrations (two, because new enum values can't be used in the transaction that adds them):
1. `pnpm db:migrate` name `media_video_enums` — only the enum changes (`ALTER TYPE "media_kind" ADD VALUE 'VIDEO'; ALTER TYPE "media_status" ADD VALUE 'PROCESSING' BEFORE 'READY';`). Edit `schema.prisma` in two steps so Prisma generates them separately.
2. name `media_video_columns` — columns + nullable `object_key`, then append:
   ```sql
   ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_storage_ref" CHECK (
     ("kind" = 'IMAGE' AND "object_key" IS NOT NULL AND "video_uid" IS NULL) OR
     ("kind" = 'VIDEO' AND "video_uid" IS NOT NULL AND "object_key" IS NULL));
   ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_duration_seconds" CHECK ("duration_seconds" IS NULL OR "duration_seconds" >= 0);
   ```
Run `pnpm --filter @influency/api generate`. The schema-conventions spec must pass.

**Shared** (`packages/shared/src/post-media.ts`):

```ts
/** Placeholder (TBD business decision): accepted post video types (Stream accepts more; keep the list short). */
export const POST_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const;
export type PostVideoType = (typeof POST_VIDEO_TYPES)[number];
/** Placeholder (TBD): max bytes per post video (200 MiB, Cloudflare Stream basic-upload ceiling). */
export const POST_VIDEO_MAX_BYTES = 200 * 1024 * 1024;
/** Placeholder (TBD): max video length, enforced by the provider. */
export const POST_VIDEO_MAX_DURATION_SECONDS = 600;
export const MEDIA_KINDS = ['IMAGE', 'VIDEO'] as const;
export const MEDIA_STATUSES = ['PENDING_UPLOAD', 'PROCESSING', 'READY', 'REJECTED'] as const;

/** Media kind from a declared content type (already validated by createMediaUploadSchema). */
export const mediaKindOf = (contentType: string): MediaKind =>
  contentType.startsWith('video/') ? 'VIDEO' : 'IMAGE';
```

`createMediaUploadSchema` becomes:

```ts
z.object({
  contentType: z.enum([...POST_IMAGE_TYPES, ...POST_VIDEO_TYPES], 'Format harus JPEG, PNG, WebP, MP4, MOV, atau WebM.'),
  byteSize: z.number().int().positive(),
}).superRefine(({ contentType, byteSize }, ctx) => {
  const video = mediaKindOf(contentType) === 'VIDEO';
  const max = video ? POST_VIDEO_MAX_BYTES : POST_IMAGE_MAX_BYTES;
  if (byteSize > max) ctx.addIssue({ code: 'custom', path: ['byteSize'],
    message: `Ukuran ${video ? 'video' : 'gambar'} maksimal ${max / 1024 / 1024} MB.` });
});
```

`studioMediaSchema` gains `durationSeconds: z.number().nullable()`. `mediaUploadResponseSchema.upload`: `method: z.enum(['PUT', 'POST'])`, `formField: z.string().optional()` (POST = `multipart/form-data` with the file under `formField`; PUT = raw body with exactly `headers`). Update the doc comment.

**Error code** (`packages/shared/src/errors.ts`): `VIDEO_PROCESSING_FAILED: { status: 422, message: 'Video tidak dapat diproses. Gunakan MP4, MOV, atau WebM, maks. 200 MB dan 10 menit.' }` (+ `errors.test.ts` if it enumerates codes).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/prisma/schema.prisma` | enum values, `videoUid`, `durationSeconds`, nullable `objectKey` |
| CREATE | `apps/api/prisma/migrations/<ts>_media_video_enums/migration.sql` | enum values |
| CREATE | `apps/api/prisma/migrations/<ts>_media_video_columns/migration.sql` | columns + 2 CHECKs |
| MODIFY | `packages/shared/src/post-media.ts` | video constants, `mediaKindOf`, schema changes |
| MODIFY | `packages/shared/src/post-media.test.ts` | tests below |
| MODIFY | `packages/shared/src/errors.ts` | `VIDEO_PROCESSING_FAILED` |

**Testing:**
- `post-media.test.ts`: accepts `video/mp4|quicktime|webm` up to `POST_VIDEO_MAX_BYTES`; rejects video at max+1 with "Ukuran video maksimal 200 MB." on path `byteSize`; image at `POST_IMAGE_MAX_BYTES + 1` still rejected with the image message; `video/avi`, `image/gif` rejected with the new format message; `mediaKindOf`; upload response parses both `PUT` and `POST` + `formField`.
- Migration applies in global setup; a raw insert of a VIDEO row with `object_key` set (or an IMAGE row without it) violates `media_assets_storage_ref` (one small case in the integration spec of TASK-050).
- TypeScript: `PostMediaService` must still compile — assert `objectKey` in the image paths (minimal change here; TASK-050 restructures).

---

### TASK-049: `VideoProvider` seam — Cloudflare Stream driver, stub driver, env and fixture

**Env** (`apps/api/src/common/env.ts`):

```ts
// Video: `stub` (private ObjectStorage + simulated processing; development/test only) or `stream` (Cloudflare Stream).
VIDEO_DRIVER: z.enum(['stub', 'stream']).default('stub'),
// Lifetime of a video upload slot (Stream direct-upload expiry allows 2 min – 6 h).
VIDEO_UPLOAD_TTL_SECONDS: z.coerce.number().int().min(120).max(21600).default(1800),
// Cloudflare Stream, required when VIDEO_DRIVER=stream; API token with Stream:Edit.
CLOUDFLARE_STREAM_ACCOUNT_ID: z.string().min(1).optional(),
CLOUDFLARE_STREAM_TOKEN: z.string().min(1).optional(),
```

In the existing `superRefine`: `stream` → each missing `CLOUDFLARE_STREAM_*` gets `required when VIDEO_DRIVER=stream`; `production` + `stub` → issue on `VIDEO_DRIVER`: `stub video is for development only`. Export `STREAM_VARS` like `R2_VARS`.

**Interface** (new `apps/api/src/common/video-provider.ts`):

```ts
export type VideoState = 'pending_upload' | 'processing' | 'ready' | 'error';
export interface VideoStatus { state: VideoState; durationSeconds: number | null; byteSize: number | null }
/** A one-shot browser upload. POST = multipart/form-data with the file under `formField`; PUT = raw body with exactly `headers`. */
export interface VideoUpload {
  uid: string;
  upload: { url: string; method: 'PUT' | 'POST'; headers: Record<string, string>; formField?: string };
}
/** Private video hosting (Cloudflare Stream or the dev stub). Uploads always require signed playback. Never log upload URLs. */
export interface VideoProvider {
  createUpload(input: { contentType: string; maxDurationSeconds: number; expiresInSeconds: number }): Promise<VideoUpload>;
  /** null when the provider has no such video. */
  getStatus(uid: string): Promise<VideoStatus | null>;
  /** Idempotent: deleting a missing video succeeds. */
  delete(uid: string): Promise<void>;
}
export const VIDEO_PROVIDER = Symbol('VIDEO_PROVIDER');
```

**Stream** (new `apps/api/src/common/cloudflare-stream-video-provider.ts`), `constructor(accountId: string, token: string)`; base `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`, header `authorization: Bearer ${token}`:
- `createUpload` → `POST ${base}/direct_upload` JSON `{ maxDurationSeconds, expiry: new Date(now + ttl*1000).toISOString(), requireSignedURLs: true }`; parse `{ result: { uid, uploadURL } }` with zod → `{ uid, upload: { url: uploadURL, method: 'POST', headers: {}, formField: 'file' } }`. `contentType` unused (Stream sniffs the file).
- `getStatus(uid)` → `GET ${base}/${encodeURIComponent(uid)}`; 404 → null; parse `result.{ readyToStream, status.state, duration, size }`. Map: `pendingupload` → `pending_upload`; `ready` with `readyToStream` → `ready`; `error` → `error`; anything else → `processing`. `durationSeconds = duration > 0 ? Math.round(duration) : null` (Stream reports -1 while unknown), `byteSize = size ?? null`.
- `delete(uid)` → `DELETE`; 404 ok.
- Non-ok responses throw `Error(\`Stream ${op} failed: ${status}\`)` — never the URL, token or response body.

**Stub** (new `apps/api/src/common/stub-video-provider.ts`), `constructor(storage: ObjectStorage, processingMs = 5000)`:
- Keys `post-video/<uid>`, `uid = randomUUID()` (matches `LocalObjectStorage` key pattern).
- `createUpload` → `storage.createUploadUrl(key, contentType, expiresInSeconds)` → `{ uid, upload: { url, method: 'PUT', headers } }`.
- `getStatus(uid)`: `validated` map (`uid → { readyAt, byteSize }`, in-memory). Not in map: `head` null → `pending_upload`; `head.size > POST_VIDEO_MAX_BYTES` → `error`; `get` → `detectVideoType(body)` null → `error`; else store `{ readyAt: Date.now() + processingMs, byteSize: head.size }`. In map: `Date.now() < readyAt` → `processing`, else `ready` with `durationSeconds: null`. Comment: `// shortcut: in-memory, per process — a restart re-validates once; dev/test only.` and `// shortcut: the presigned PUT stays valid after validation (dev-only driver); Stream upload URLs are one-time.`
- `delete(uid)` → `storage.delete(key)` + drop from map.

**Video magic bytes** (`apps/api/src/common/image-type.ts` → add `detectVideoType` next to `detectImageType`, reuse `startsWith`/`ascii`): bytes 4–7 `ftyp` → brand at 8–11 `qt  ` → `video/quicktime`, otherwise `video/mp4`; `1A 45 DF A3` → `video/webm`; else null. Rename the file? No — keep it; update its header comment to "image and video".

**Provider wiring** (`common.module.ts`): `{ provide: VIDEO_PROVIDER, useFactory: (env, storage) => env.VIDEO_DRIVER === 'stream' ? new CloudflareStreamVideoProvider(env.CLOUDFLARE_STREAM_ACCOUNT_ID!, env.CLOUDFLARE_STREAM_TOKEN!) : new StubVideoProvider(storage), inject: [ENV, OBJECT_STORAGE] }`; export `VIDEO_PROVIDER`.

**Body parser** (`app.factory.ts`): add a `/^video\//` buffer parser with `bodyLimit: POST_VIDEO_MAX_BYTES` (stub uploads via `PUT /dev-storage/post-video/:id`). Update the comment. `DevStorageController` needs no change.

**Test helper** (new `apps/api/test/fake-video-provider.ts`): `createFakeVideoProvider()` → `{ provider, videos: Map<uid, VideoStatus>, created: string[], deleted: string[], failNext: { getStatus, delete } }`. `createUpload` registers `{ state: 'pending_upload', … }` under a new uuid and returns `{ url: \`fake://upload/${uid}\`, method: 'POST', headers: {}, formField: 'file' }`. Tests drive states by editing `videos`.

**Fixture:** `apps/api/test/fixtures/sample.mp4` (≤ 50 KB, e.g. `ffmpeg -f lavfi -i testsrc=duration=1:size=160x90:rate=10 -pix_fmt yuv420p -movflags +faststart sample.mp4`). Add a one-line `apps/api/test/fixtures/README.md` saying what it is and how it was made.

**Housekeeping:** `.env.example` — `VIDEO_DRIVER=stub`, `VIDEO_UPLOAD_TTL_SECONDS=1800`, Stream block `CLOUDFLARE_STREAM_ACCOUNT_ID=SET_LOCALLY`, `CLOUDFLARE_STREAM_TOKEN=SET_LOCALLY` "only read when VIDEO_DRIVER=stream"; fix the R2 comment that currently mentions Stream. README: video drivers, Stream token scope, uploads are always `requireSignedURLs`, stub size caveat. CI: driver defaults to stub — no change unless it breaks.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/common/env.ts` (+ `env.spec.ts`) | video vars + rules |
| CREATE | `apps/api/src/common/video-provider.ts` | interface + token |
| CREATE | `apps/api/src/common/cloudflare-stream-video-provider.ts` (+ `.spec.ts`) | Stream driver |
| CREATE | `apps/api/src/common/stub-video-provider.ts` (+ `.spec.ts`) | stub driver |
| MODIFY | `apps/api/src/common/image-type.ts` (+ spec if one exists, else add cases where `detectImageType` is tested) | `detectVideoType` |
| MODIFY | `apps/api/src/common/common.module.ts` | provider factory + export |
| MODIFY | `apps/api/src/app.factory.ts` | `video/*` parser |
| CREATE | `apps/api/test/fake-video-provider.ts` | test double |
| CREATE | `apps/api/test/fixtures/sample.mp4`, `apps/api/test/fixtures/README.md` | fixture |
| MODIFY | `.env.example`, `README.md` | config/docs |

**Testing:**
- `env.spec.ts`: default `stub` with no Stream vars; `stream` missing `CLOUDFLARE_STREAM_TOKEN` → error naming it, never its value; `production` + `stub` → error on `VIDEO_DRIVER` (with `STORAGE_DRIVER=r2` + R2 vars so only this issue fires); TTL 119 / 21601 rejected.
- `cloudflare-stream-video-provider.spec.ts` (stub `fetch`): `createUpload` sends `requireSignedURLs: true`, `maxDurationSeconds`, `expiry` ≈ now + ttl, bearer header, returns POST/`file`; `getStatus` maps `pendingupload`/`queued`/`inprogress`/`ready`+`readyToStream`/`error`, `duration: -1` → null, 404 → null; `delete` 404 ok; a 500 throws a message containing neither the token nor the URL.
- `stub-video-provider.spec.ts` (memory storage, fake timers): no object → `pending_upload`; `sample.mp4` bytes → `processing`, then `ready` after `processingMs` with `byteSize`; `%PDF` bytes → `error`; object over `POST_VIDEO_MAX_BYTES` (fake `head`) → `error` without `get`; `delete` removes the object.
- `detectVideoType`: MP4 fixture → `video/mp4`; `ftypqt  ` → `video/quicktime`; EBML → `video/webm`; PNG/JPEG/empty → null.

---

### TASK-050: Video branch in the post media API

Modify `apps/api/src/modules/posts/post-media.service.ts` (inject `@Inject(VIDEO_PROVIDER) private readonly video: VideoProvider`). Routes and controller stay the same. Owner scoping, the `FOR UPDATE` post lock and error mapping stay as they are.

- **`createUpload`** — `kind = mediaKindOf(input.contentType)`.
  - In the existing transaction, the count also includes `status: 'PROCESSING'`.
  - Video: call `this.video.createUpload({ contentType, maxDurationSeconds: POST_VIDEO_MAX_DURATION_SECONDS, expiresInSeconds: env.VIDEO_UPLOAD_TTL_SECONDS })` **inside** the transaction, after the limit check and before the insert, so the row gets `videoUid` (the post lock is held during one provider call; acceptable at MVP volume). Insert `{ kind: 'VIDEO', videoUid: uid, objectKey: null, contentType, byteSize, uploadExpiresAt: now + VIDEO_UPLOAD_TTL_SECONDS }`. If the insert fails after the provider call, best-effort `video.delete(uid)` in a `catch` and rethrow.
  - Response `upload: { url, method, headers, formField, expiresAt }`. Never log the URL.
  - Image path unchanged (`method: 'PUT'`).
- **`complete`** — after `findOwned`: `READY` → return; `REJECTED` → `MEDIA_UPLOAD_MISSING`; IMAGE → existing code (assert `objectKey`). VIDEO:
  - `PROCESSING` → `return this.syncVideo(row)`.
  - `PENDING_UPLOAD` + expired → `reject(row)` + `MEDIA_UPLOAD_MISSING` (as for images).
  - `status = await video.getStatus(uid)`; null or `pending_upload` → `MEDIA_UPLOAD_MISSING` (row stays pending).
  - `error` → `reject(row)` then `VIDEO_PROCESSING_FAILED`.
  - `processing` → `updateMany({ id, status: 'PENDING_UPLOAD' } → PROCESSING)`.
  - `ready` → `updateMany({ id, status: { in: ['PENDING_UPLOAD', 'PROCESSING'] } } → READY, durationSeconds, byteSize: status.byteSize ?? row.byteSize)`.
  - Re-read (`findOwned`) and return.
- **`syncVideo(row)`** (private, used by `complete` and `list`): `getStatus`; `ready` → READY transition as above; `error` or null → conditional `PROCESSING → REJECTED` + best-effort `video.delete`; `processing` → unchanged. Conditional `updateMany` everywhere so a concurrent delete/complete wins cleanly. Comment: `// shortcut: a video stuck in PROCESSING keeps counting toward the limit until deleted; add a sweeper/Stream webhook with the worker (Phase 5).`
- **`list`** — return `status in [READY, PROCESSING]`. Before reading, run `syncVideo` for each `PROCESSING` VIDEO row of the post (`Promise.all`). A provider error is caught per row and logged (`video status check failed for media ${id}: ${message}` — no URL, no uid needed), and the row stays PROCESSING; `list` never fails because Stream is down. Then re-query.
- **`content`** — `row.kind !== 'IMAGE'` → `NOT_FOUND` (playback is US-021).
- **`remove`** — after `deleteMany`: IMAGE → `deleteObject(objectKey)`; VIDEO → best-effort `video.delete(videoUid)` with the same warn-log pattern (log the media id, not the uid).
- **`reject(row)`** — branches the best-effort cleanup the same way.
- `toStudioMedia` adds `durationSeconds`; still never returns `objectKey`, `videoUid` or `postId`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/modules/posts/post-media.service.ts` | video branch |
| CREATE | `apps/api/src/modules/posts/post-media-video.integration.spec.ts` | tests below |
| MODIFY | `apps/api/src/modules/posts/post-media.integration.spec.ts` | override `VIDEO_PROVIDER` with the fake; `durationSeconds: null` in image expectations |

**Testing** (`post-media-video.integration.spec.ts`, real Postgres; boot/session setup copied from `post-media.integration.spec.ts` + `VIDEO_PROVIDER` overridden by `createFakeVideoProvider()`; ids in range `0190a000-0000-7000-8000-0000001e…`; mutating requests send `cookie` + `origin`):
- Slot `video/mp4` → 201, `media.kind: VIDEO`, `PENDING_UPLOAD`, `upload.method: POST`, `formField: 'file'`, `expiresAt` ≈ now + 1800 s, `no-store`; body has no `videoUid`/`objectKey`/uid string anywhere (`JSON.stringify(body)` does not contain the fake uid except inside `upload.url`).
- `video/mp4` over `POST_VIDEO_MAX_BYTES` → 400 path `byteSize`; `video/avi` → 400 path `contentType`.
- Complete while fake is `pending_upload` → 409 `MEDIA_UPLOAD_MISSING`, row still pending. Fake `processing` → 200 `PROCESSING`; list includes it with `PROCESSING`; fake → `ready` (duration 12, size 1234) → next `list` shows READY, `durationSeconds: 12`, `byteSize: 1234`; complete again → 200 READY (idempotent).
- Fake `error` on complete → 422 `VIDEO_PROCESSING_FAILED`, row REJECTED, uid in `deleted`; error while PROCESSING → `list` drops it, row REJECTED, uid deleted.
- `failNext.getStatus` during `list` → 200, row still PROCESSING.
- `content` on a READY video → 404 `NOT_FOUND`.
- Delete video → 204, row gone, uid in `deleted`; `failNext.delete` → still 204.
- Limit: 9 media + 1 PROCESSING video → next slot 409 `MEDIA_LIMIT_REACHED`.
- Isolation: creator B on A's video (complete, list, content, delete) → 404 identical to unknown id; nothing changes, the fake gets no calls.
- DB guard: raw insert of a VIDEO row with `object_key` set → constraint `media_assets_storage_ref` error.
- Existing image specs stay green.

---

### TASK-051: Video upload and processing status on the studio post page

Rename `apps/web/src/app/studio/posts/[postId]/post-images.tsx` → `post-media.tsx` (component `PostMedia`) and its test → `post-media.test.tsx` (`git mv`); update `page.tsx`. Section heading "Media".

- **Input:** `accept` = `[...POST_IMAGE_TYPES, ...POST_VIDEO_TYPES].join(',')`; label "Tambah gambar atau video"; hint "Gambar JPEG/PNG/WebP maks. 10 MB · Video MP4/MOV/WebM maks. 200 MB, 10 menit · {n}/{POST_MEDIA_MAX_PER_POST}" built from the shared constants.
- **Upload step:** after the slot, branch on `upload.method`:
  - `'POST'` → `const form = new FormData(); form.append(upload.formField ?? 'file', file); fetch(upload.url, { method: 'POST', body: form })` (no `credentials`, no headers — the browser sets the multipart boundary).
  - `'PUT'` → the existing call.
  Then `complete`, then `router.refresh()`. A 200 `PROCESSING` from complete shows "Video sedang diproses…" in the live region. A slow-upload status text "Mengunggah video… (jangan tutup halaman)" for video.
- **Grid:** IMAGE → existing `<img>`. VIDEO → a card (no player, no URL): a video icon or the text "Video", a status badge — `PROCESSING` "Memproses…", `READY` "Siap" + duration formatted `m:ss` when `durationSeconds` is set — and the existing "Hapus" button. The status is text, not just color (a11y).
- **Polling:** `useEffect(() => { if (!media.some((m) => m.status === 'PROCESSING')) return; const t = setInterval(() => router.refresh(), 5000); return () => clearInterval(t); }, [media, router])`.
- The fetcher `getMyPostMedia` needs no change (the schema now carries the new fields).
- No CSP in `next.config.ts` today; README notes that a future CSP must allow `connect-src` to the Stream upload host.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| RENAME+MODIFY | `apps/web/src/app/studio/posts/[postId]/post-images.tsx` → `post-media.tsx` | video upload, cards, polling |
| RENAME+MODIFY | `apps/web/src/app/studio/posts/[postId]/post-images.test.tsx` → `post-media.test.tsx` | tests below |
| MODIFY | `apps/web/src/app/studio/posts/[postId]/page.tsx` | use `PostMedia` |
| MODIFY | `apps/web/src/lib/api/studio-post-media.test.ts` | fixtures gain `durationSeconds` (only if they parse strictly) |

**Testing** (Vitest + Testing Library, mocks as in the existing test):
- The existing image tests pass after the rename.
- A video slot with `method: 'POST'` → the second fetch is a POST to `upload.url` with a `FormData` body containing the file under `file`, no `credentials`; then complete; then `router.refresh()`.
- A 250 MB `video/mp4` → "Ukuran video maksimal 200 MB." and no fetch; `video/avi` → format message.
- `PROCESSING` video renders "Memproses…" and no `<img>`/`<video>`; READY with `durationSeconds: 75` renders "1:15".
- With fake timers: a PROCESSING item → `router.refresh` is called after 5 s; with no PROCESSING items → not called; the interval is cleared on unmount.
- Complete returning `PROCESSING` shows "Video sedang diproses…".
- Manual: `pnpm dev` (stub driver), dev-login as `claudia`, upload `apps/api/test/fixtures/sample.mp4` to a draft → "Memproses…" → "Siap" within about 10 s without a reload; upload a `.txt` renamed `.mp4` → "Video tidak dapat diproses…"; delete the video; `.local-storage/post-video/` holds the file until deleted; `GET …/media/<videoId>/content` → 404.
