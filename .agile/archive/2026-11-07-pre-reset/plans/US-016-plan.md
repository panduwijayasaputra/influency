# Technical Plan: US-016 — Upload Images to Private Storage

## Architecture Overview

Agreed with the user:

- **Presigned upload + complete step** (handoff §11 `POST /media/upload-url`, §19 "presigned upload URLs with limited scope"). The browser asks the API for an upload slot, PUTs the bytes **directly to storage**, then calls `complete`. The API checks the real size and magic bytes before the image counts. R2 presigned PUTs cannot enforce a size cap, so `complete` is where size and type are enforced: a bad object is deleted and its row marked `REJECTED`.
- **Explicit `STORAGE_DRIVER=local|r2`** (default `local`). `local` = filesystem adapter whose "presigned URL" is a dev-only API route guarded by an HMAC token with expiry; rejected when `NODE_ENV=production`. R2 vars become required only for `r2`. US-012 profile images get the local driver for free (same `ObjectStorage` seam).
- **Extras:** owner-only preview (API streams the image, `no-store`) and delete.
- **Limits (TBD placeholders, shared constants):** JPEG/PNG/WebP, ≤ 10 MiB per image, ≤ 10 images per post; upload URL valid `UPLOAD_URL_TTL_SECONDS` (default 300).

Routes follow the US-015 decision (owner-scoped under `/creators/me/posts`) instead of the handoff's flat `/media/upload-url`. They use `/media` (not `/images`) so US-017 can add video to the same collection; the kind is derived from the content type.

```
Browser                    API                                 Storage (R2 / local)
  │ POST …/posts/:id/media {contentType, byteSize}
  │──────────────────────▶ owner check, limits, lock post row,
  │                        insert media_assets PENDING_UPLOAD
  │◀────────────────────── {media, upload:{url, headers, expiresAt}}
  │ PUT url (content-type signed) ─────────────────────────────▶ object post-media/<uuid>
  │ POST …/media/:mediaId/complete
  │──────────────────────▶ head → size ≤ max? get → magic bytes ok?
  │                        yes: READY (detected type, real size)
  │                        no:  delete object, REJECTED, 413/415
```

AC mapping:

| Acceptance criterion | How |
|---|---|
| Short-lived, scoped upload URL only to the post owner | `ApprovedCreatorGuard` + every query scoped by `req.creatorProfileId` (foreign post = 404); URL signs one server-generated key + content type, expires after `UPLOAD_URL_TTL_SECONDS` |
| Allowed types/sizes (configurable), checked by content | Declared type/size validated up front; `complete` checks actual size via `head` and type via `detectImageType` magic bytes; stores the detected type |
| Private bucket, no permanent public URL | Keys `post-media/<uuid>` in the private bucket; no public read route; owner preview streams via the API with `private, no-store` |
| Local dev adapter without cloud credentials | `LocalObjectStorage` + `PUT /dev-storage/:prefix/:id` (HMAC token), selected by `STORAGE_DRIVER=local` |

Out of scope (owned elsewhere): viewer media access / signed GET URLs (US-021), video (US-017), edit/delete rules once a post is PUBLISHED or purchased (US-019 — flag: deleting media from a sold post affects buyers), image ordering/reordering, EXIF stripping / thumbnails / malware scan (handoff §19, needs `media.process` worker), cleanup of abandoned `PENDING_UPLOAD` rows/objects (worker, Phase 5).

## Dependencies

- None new. `aws4fetch` (already installed) supports query signing (`aws: { signQuery: true }`) for presigned URLs. Node `crypto` (HMAC, `timingSafeEqual`) and `fs/promises` for the local driver.
- **Live R2 only:** the bucket needs a CORS rule allowing `PUT` with header `content-type` from `WEB_ORIGIN` (documented in README, not code).

## Risks

- **R2 presign details:** verify against [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) that a signed `content-type` header is enforced on PUT. If R2 docs disagree, follow the docs and note it in the plan/README. `complete` re-checks the type from bytes anyway, so a wrong header can't produce a non-image READY row.
- **Unbounded R2 upload size:** a creator can PUT a huge object to a valid URL. Mitigation: `complete` calls `head` first and deletes without downloading when `size > POST_IMAGE_MAX_BYTES`; abandoned oversized objects (never completed) remain until the cleanup job — `shortcut:` comment.
- **Max-images race:** two concurrent slot requests could both see 9. Mitigation: lock the post row (`SELECT … FOR UPDATE`) inside the insert transaction.
- **Next rewrite proxy body size (local driver):** 10 MiB PUTs go through the `/api/v1` rewrite. Dev verifies a 10 MiB upload works locally; if Next caps it, document and point the local upload URL at `API_ORIGIN` instead.
- **Fixed test ids:** use the next free range `0190a000-0000-7000-8000-0000001d…`.

## Tasks

### TASK-044: Storage driver selection, presign/head on the storage seam, local dev adapter

**Env** (`apps/api/src/common/env.ts`):

```ts
// Object storage: `local` (filesystem, dev/test only) or `r2` (Cloudflare R2, private bucket).
STORAGE_DRIVER: z.enum(['local', 'r2']).default('local'),
LOCAL_STORAGE_DIR: z.string().min(1).default('.local-storage'),
// Lifetime of presigned upload URLs.
UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
R2_ACCOUNT_ID: z.string().min(1).optional(),   // same for the other three R2_* vars
```

Add a `.superRefine` on the object: `r2` → each missing `R2_*` gets an issue `required when STORAGE_DRIVER=r2` (path = the var); `NODE_ENV=production` + `local` → issue on `STORAGE_DRIVER`: `local storage is for development only`. `parseEnv` keeps listing paths/messages only. Existing `MIDTRANS_IS_PRODUCTION` refine stays.

**Interface** (`apps/api/src/common/object-storage.ts`) — add:

```ts
export interface ObjectHead { size: number; contentType: string }
/** A presigned single-object PUT. The client must send exactly `headers`. */
export interface UploadUrl { url: string; headers: Record<string, string>; expiresAt: Date }

// in ObjectStorage:
/** Presigned PUT for one server-generated key; the signed content type must be sent as-is. */
createUploadUrl(key: string, contentType: string, expiresInSeconds: number): Promise<UploadUrl>;
/** Size and type without downloading; null when missing. */
head(key: string): Promise<ObjectHead | null>;
```

**R2** (`r2-object-storage.ts`): constructor takes the R2 fields as defined strings (factory passes them after the driver check). `createUploadUrl`: `const url = new URL(this.url(key)); url.searchParams.set('X-Amz-Expires', String(ttl));` then `const signed = await this.client.sign(url.toString(), { method: 'PUT', headers: { 'content-type': contentType }, aws: { signQuery: true, allHeaders: true } });` → `{ url: signed.url, headers: { 'content-type': contentType }, expiresAt }`. `head`: `HEAD` → 404 null, `!ok` throws `R2 head failed: <status>`, else `content-length` / `content-type`. Never log the signed URL. Update the existing `shortcut:` comment (profile images ≤ 5 MiB, post images ≤ 10 MiB, `get` is only called after `head` has checked the size).

**Local** (new `apps/api/src/common/local-object-storage.ts`) `LocalObjectStorage implements ObjectStorage`:

- `constructor(dir: string)` — `this.root = resolve(dir)`; `this.secret = randomBytes(32)` (per process; a restart only invalidates pending ≤5-min URLs).
- Key guard: `KEY_PATTERN = /^[a-z-]+\/[0-9a-f-]{36}$/` (all keys are `<prefix>/<uuid>`), throw on mismatch before touching the filesystem.
- Files: bytes at `<root>/<key>`, content type at `<root>/<key>.type` (plain text). `put` → `mkdir(dirname, { recursive: true })` + two `writeFile`s. `get`/`head` → `ENOENT` → null (`head` uses `stat().size`). `delete` → `rm(..., { force: true })` for both files.
- `createUploadUrl(key, contentType, ttl)` → `exp = now + ttl` (unix seconds), `sig = HMAC-SHA256(secret, \`${key}\n${contentType}\n${exp}\`)` base64url; `url = \`/api/v1/dev-storage/${key}?exp=${exp}&sig=${sig}\`` (relative: resolves against the web origin through the `/api/v1` rewrite).
- `verifyUploadToken(key, contentType, exp, sig): boolean` — false if `exp` is not an integer, `exp < now`, or `timingSafeEqual` on equal-length buffers fails.

**Provider** (`common.module.ts`): `useFactory: (env) => env.STORAGE_DRIVER === 'r2' ? new R2ObjectStorage(env) : new LocalObjectStorage(env.LOCAL_STORAGE_DIR)`.

**Dev upload route** — new module `apps/api/src/modules/dev-storage/` (`dev-storage.module.ts`, `dev-storage.controller.ts`), registered in `app.module.ts`:

```ts
/** Stand-in for a presigned R2 PUT when STORAGE_DRIVER=local. 404 with any other driver. */
@Controller('dev-storage')
export class DevStorageController {
  @Put(':prefix/:id') @HttpCode(204)
  async upload(@Param('prefix') prefix, @Param('id') id, @Query('exp') exp, @Query('sig') sig, @Headers('content-type') contentType, @Body() body: Buffer): Promise<void>
}
```

`!(storage instanceof LocalObjectStorage)` → `DomainError('NOT_FOUND')`; `!verifyUploadToken(...)` → `DomainError('FORBIDDEN')`; else `storage.put(key, body, contentType)`. No session needed (the token is the authorization, like a presigned URL); CSRF guard passes because the browser's same-origin PUT sends `Origin`.

**Body parser** (`app.factory.ts`): raise the `image/*` parser `bodyLimit` to `Math.max(PROFILE_IMAGE_MAX_BYTES.banner, POST_IMAGE_MAX_BYTES)` (constant from TASK-045 — implement TASK-045's shared constants first or in the same change). Profile service already enforces its own per-kind limits; keep its tests green.

**Test helper** (`apps/api/test/memory-storage.ts`): add `createUploadUrl` → `{ url: \`memory://upload/${key}\`, headers: { 'content-type': contentType }, expiresAt }` and `head` → `{ size: body.length, contentType }` or null; `Op` gains `'head'`. Tests simulate the browser PUT with `objects.set(key, …)`.

**Housekeeping:** `.gitignore` add `.local-storage/`; `.env.example` add `STORAGE_DRIVER=local`, `LOCAL_STORAGE_DIR`, `UPLOAD_URL_TTL_SECONDS=300` with comments, R2 block says "only needed with STORAGE_DRIVER=r2"; CI workflow env: keep R2 placeholders or drop them (driver defaults to local) — keep it booting. README: storage drivers + R2 bucket CORS rule (`AllowedOrigins: [WEB_ORIGIN]`, `AllowedMethods: [PUT]`, `AllowedHeaders: [content-type]`).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/common/env.ts` | `STORAGE_DRIVER`, `LOCAL_STORAGE_DIR`, `UPLOAD_URL_TTL_SECONDS`, conditional R2 vars |
| MODIFY | `apps/api/src/common/env.spec.ts` | driver rules |
| MODIFY | `apps/api/src/common/object-storage.ts` | `createUploadUrl`, `head`, types |
| MODIFY | `apps/api/src/common/r2-object-storage.ts` | presign + head |
| CREATE | `apps/api/src/common/r2-object-storage.spec.ts` | presign/head unit tests (stub `fetch`) |
| CREATE | `apps/api/src/common/local-object-storage.ts` | filesystem adapter + HMAC tokens |
| CREATE | `apps/api/src/common/local-object-storage.spec.ts` | adapter tests (temp dir) |
| MODIFY | `apps/api/src/common/common.module.ts` | driver factory |
| CREATE | `apps/api/src/modules/dev-storage/dev-storage.module.ts` | module |
| CREATE | `apps/api/src/modules/dev-storage/dev-storage.controller.ts` | local upload route |
| CREATE | `apps/api/src/modules/dev-storage/dev-storage.integration.spec.ts` | route tests |
| MODIFY | `apps/api/src/app.module.ts` | import `DevStorageModule` |
| MODIFY | `apps/api/src/app.factory.ts` | parser limit |
| MODIFY | `apps/api/test/memory-storage.ts` | new methods |
| MODIFY | `.gitignore`, `.env.example`, `README.md`, `.github/workflows/ci.yml` (only if needed) | config/docs |

**Testing:**
- `env.spec.ts`: default driver `local` without any `R2_*`; `r2` with a missing `R2_BUCKET` → error naming `R2_BUCKET` and never its value; `production` + `local` → error on `STORAGE_DRIVER`; TTL outside 60–3600 rejected.
- `local-object-storage.spec.ts` (`mkdtemp` dir): put/get/head/delete round-trip with content type; missing → null; delete missing ok; key `../x` or `post-media/../../etc` throws; token verifies for the right key+type+exp; fails for other key, other content type, tampered sig, expired `exp` (fake timers), non-numeric `exp`.
- `r2-object-storage.spec.ts`: presigned URL contains `X-Amz-Expires=300`, `X-Amz-Signature`, `X-Amz-SignedHeaders` including `content-type`, host `<account>.r2.cloudflarestorage.com`, and makes no network call; `head` maps 200 / 404 / 500 (stubbed `fetch`), error message has no URL.
- `dev-storage.integration.spec.ts` (app with a `LocalObjectStorage` on a temp dir overriding `OBJECT_STORAGE`): valid PUT → 204 and bytes stored; wrong content type / expired / bad sig → 403; with memory storage override → 404.
- Existing creator-profile specs stay green.

---

### TASK-045: `media_assets` schema, migration and shared media contract

**Prisma** (`apps/api/prisma/schema.prisma`), following the header conventions:

```prisma
/// US-016 images; US-017 adds VIDEO.
enum MediaKind {
  IMAGE

  @@map("media_kind")
}

enum MediaStatus {
  PENDING_UPLOAD
  READY
  REJECTED

  @@map("media_status")
}

/// Media attached to a post (US-016). Bytes live in private storage under `object_key`; the API decides access.
model MediaAsset {
  id              String      @id @default(dbgenerated("uuidv7()")) @db.Uuid
  postId          String      @map("post_id") @db.Uuid
  kind            MediaKind
  status          MediaStatus @default(PENDING_UPLOAD)
  /// Server-generated `post-media/<uuid>`; never from the client.
  objectKey       String      @unique @map("object_key")
  /// Declared at upload request; replaced by the magic-byte type on READY.
  contentType     String      @map("content_type")
  /// Declared at upload request; replaced by the stored size on READY.
  byteSize        Int         @map("byte_size")
  uploadExpiresAt DateTime    @map("upload_expires_at") @db.Timestamptz(3)
  createdAt       DateTime    @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt       DateTime    @updatedAt @map("updated_at") @db.Timestamptz(3)
  post            Post        @relation(fields: [postId], references: [id], onDelete: Restrict)

  @@index([postId, createdAt])
  @@map("media_assets")
}
```

Add `media MediaAsset[]` to `Post`. `pnpm db:migrate` (name `media_assets`), append `ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_byte_size" CHECK ("byte_size" > 0);`. Run `pnpm --filter @influency/api generate`. Schema-conventions spec must pass unchanged.

**Shared** — new `packages/shared/src/post-media.ts`, exported from `index.ts`:

```ts
/** Placeholder (TBD business decision): accepted post image types — same set as profile images. */
export const POST_IMAGE_TYPES = PROFILE_IMAGE_TYPES;
/** Placeholder (TBD): max bytes per post image (10 MiB). */
export const POST_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
/** Placeholder (TBD): max media items per post. */
export const POST_MEDIA_MAX_PER_POST = 10;
export const MEDIA_KINDS = ['IMAGE'] as const;
export const MEDIA_STATUSES = ['PENDING_UPLOAD', 'READY', 'REJECTED'] as const;

/** Body of POST /creators/me/posts/:id/media. */
export const createMediaUploadSchema = z.object({
  contentType: z.enum(POST_IMAGE_TYPES, 'Format gambar harus JPEG, PNG, atau WebP.'),
  byteSize: z.number().int().positive().max(POST_IMAGE_MAX_BYTES, 'Ukuran gambar maksimal 10 MB.'),
});
export type CreateMediaUploadInput = z.infer<typeof createMediaUploadSchema>;

export const studioMediaSchema = z.object({
  id: z.string(), kind: z.enum(MEDIA_KINDS), status: z.enum(MEDIA_STATUSES),
  contentType: z.string(), byteSize: z.number(), createdAt: z.string(),
});
export type StudioMedia = z.infer<typeof studioMediaSchema>;
export const studioMediaListSchema = z.object({ media: z.array(studioMediaSchema) });
export type StudioMediaList = z.infer<typeof studioMediaListSchema>;

export const mediaUploadResponseSchema = z.object({
  media: studioMediaSchema,
  upload: z.object({ url: z.string(), method: z.literal('PUT'), headers: z.record(z.string(), z.string()), expiresAt: z.string() }),
});
export type MediaUploadResponse = z.infer<typeof mediaUploadResponseSchema>;
```

(Import `PROFILE_IMAGE_TYPES` from `./creators.js`. Size message: derive "10 MB" from the constant so the placeholder stays in one place.)

**Error codes** (`packages/shared/src/errors.ts`): `MEDIA_LIMIT_REACHED` 409 "Batas jumlah media per post sudah tercapai." and `MEDIA_UPLOAD_MISSING` 409 "File belum terunggah. Coba unggah ulang." (+ `errors.test.ts` if it enumerates codes).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/prisma/schema.prisma` | enums + `MediaAsset` + `Post.media` |
| CREATE | `apps/api/prisma/migrations/<ts>_media_assets/migration.sql` | generated + byte_size CHECK |
| CREATE | `packages/shared/src/post-media.ts` | constants + schemas |
| CREATE | `packages/shared/src/post-media.test.ts` | schema tests |
| MODIFY | `packages/shared/src/index.ts` | export |
| MODIFY | `packages/shared/src/errors.ts` | 2 error codes |

**Testing:**
- `post-media.test.ts`: accepts `image/jpeg` + 1 byte and `POST_IMAGE_MAX_BYTES`; rejects `image/gif`, `application/pdf`, `byteSize` 0 / negative / float / max+1 with the Bahasa messages; strips unknown keys (e.g. `objectKey`).
- Migration applies in global setup; schema-conventions spec passes.

---

### TASK-046: Post media API (upload slot, complete, list, owner preview, delete)

New files in the existing `posts` module: `post-media.controller.ts`, `post-media.service.ts`, registered in `posts.module.ts`. Inject `PrismaService`, `@Inject(OBJECT_STORAGE) storage`, `@Inject(ENV) env`, Nest `Logger`.

```ts
const uuidPipe = new ZodValidationPipe(z.uuid());

/** Media of the approved creator's own posts. Every query is scoped to req.creatorProfileId. */
@Controller('creators/me/posts/:postId/media')
@UseGuards(ApprovedCreatorGuard)
export class PostMediaController {
  @Post()                                   // 201 MediaUploadResponse
  createUpload(@Req() req, @Param('postId', uuidPipe) postId, @Body(new ZodValidationPipe(createMediaUploadSchema)) body)
  @Post(':mediaId/complete') @HttpCode(200) // StudioMedia
  complete(@Req() req, @Param('postId', uuidPipe) postId, @Param('mediaId', uuidPipe) mediaId)
  @Get() @Header('cache-control', 'no-store')            // StudioMediaList
  list(@Req() req, @Param('postId', uuidPipe) postId)
  @Get(':mediaId/content')                  // image bytes
  content(@Req() req, @Param(...) postId, @Param(...) mediaId, @Res({ passthrough: true }) reply): Promise<Buffer>
  @Delete(':mediaId') @HttpCode(204)
  remove(@Req() req, @Param(...) postId, @Param(...) mediaId): Promise<void>
}
```

Service (`creatorProfileId` always from `req.creatorProfileId!`; owner scope on media = `{ id: mediaId, post: { id: postId, creatorProfileId } }`, so a foreign post or a media id from another post gives the same 404 `NOT_FOUND`):

- **`createUpload(creatorProfileId, postId, input)`** — one `prisma.$transaction`:
  1. `SELECT id FROM posts WHERE id = $postId AND creator_profile_id = $creatorProfileId FOR UPDATE` (`$queryRaw`, tagged template); no row → `NOT_FOUND`. Serializes concurrent slot requests for the same post.
  2. `count` media of the post where `status = READY` OR (`status = PENDING_UPLOAD` AND `uploadExpiresAt > now()`); `>= POST_MEDIA_MAX_PER_POST` → `MEDIA_LIMIT_REACHED`.
  3. Insert `{ postId, kind: 'IMAGE', objectKey: \`post-media/${randomUUID()}\`, contentType, byteSize, uploadExpiresAt: now + UPLOAD_URL_TTL_SECONDS }`.
  
  After commit: `storage.createUploadUrl(objectKey, contentType, env.UPLOAD_URL_TTL_SECONDS)` → `{ media: toStudioMedia(row), upload: { url, method: 'PUT', headers, expiresAt: iso } }`. Response `cache-control: no-store`. Never log the URL.
- **`complete(creatorProfileId, postId, mediaId)`** — load owner-scoped row (else `NOT_FOUND`). `READY` → return it (idempotent retry). `REJECTED` → `UNSUPPORTED_FILE_TYPE`/`FILE_TOO_LARGE` cannot be reconstructed, so return `MEDIA_UPLOAD_MISSING` (client must request a new slot). `PENDING_UPLOAD`:
  1. `head = storage.head(key)`; null → `MEDIA_UPLOAD_MISSING` (row stays pending; it expires and stops counting).
  2. `head.size > POST_IMAGE_MAX_BYTES` → `reject(row)` then `FILE_TOO_LARGE`. Never download it.
  3. `object = storage.get(key)`; `detected = detectImageType(object.body)`; not in `POST_IMAGE_TYPES` → `reject(row)` then `UNSUPPORTED_FILE_TYPE`.
  4. Conditional transition `updateMany({ where: { id, status: 'PENDING_UPLOAD' }, data: { status: 'READY', contentType: detected, byteSize: object.body.length } })`; re-read and return (a concurrent `complete` that already won just returns READY).
  5. *(Added in QA.)* The presigned URL stays valid until expiry and can't be revoked, so before step 4 the checked bytes are `put` to a fresh key `post-media/<uuid>`; step 4 also sets `objectKey` to it, and the upload key is deleted best-effort (or the fresh key, if the transition lost a race). Expired `PENDING_UPLOAD` rows are rejected on `complete` (they no longer count toward the limit).
  
  `reject(row)`: `updateMany` PENDING_UPLOAD → REJECTED, then best-effort `storage.delete` (log key + error message on failure, like the avatar replace path). Comment: `// shortcut: abandoned PENDING_UPLOAD objects (incl. oversized ones never completed) stay in storage; add a cleanup job with the worker (Phase 5).`
- **`list`** — post owner check (`post.findFirst({ id, creatorProfileId })` else `NOT_FOUND`), then READY media ordered `createdAt asc, id asc`.
- **`content`** — owner-scoped READY row else `NOT_FOUND`; `storage.get` (null → `NOT_FOUND`); headers `content-type: row.contentType` (the detected type, not the storage metadata), `cache-control: private, no-store`, `x-content-type-options: nosniff`, `content-disposition: inline`. Mirrors `CreatorProfileController.image`.
- **`remove`** — owner-scoped `deleteMany` (any status) → `count === 0` → `NOT_FOUND`; then best-effort `storage.delete(objectKey)` (read the key in the same transaction before deleting, or `findFirst` then `deleteMany` by id + scope). Status rules for published posts are US-019's (risk noted above).
- `toStudioMedia(row)`: `id, kind, status, contentType, byteSize, createdAt` (ISO). Never return `objectKey` or `postId`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/posts/post-media.controller.ts` | 5 routes |
| CREATE | `apps/api/src/modules/posts/post-media.service.ts` | owner-scoped logic |
| CREATE | `apps/api/src/modules/posts/post-media.integration.spec.ts` | tests below |
| MODIFY | `apps/api/src/modules/posts/posts.module.ts` | register controller + service |

**Testing** (`post-media.integration.spec.ts`, real Postgres; boot/session setup copied from `posts.integration.spec.ts` incl. `createMemoryStorage()` + Telegram overrides; fixed ids in range `0190a000-0000-7000-8000-0000001d…`; `afterAll` deletes media_assets → posts → sessions → creator profiles → users; mutating requests send `cookie` + `origin: WEB_ORIGIN`). Use real tiny JPEG/PNG/WebP byte headers (as in creator-profile specs):
- Upload slot → 201, `media.status: PENDING_UPLOAD`, `upload.url` is `memory://upload/post-media/<uuid>`, `upload.headers['content-type']` = declared, `expiresAt` ≈ now + TTL, `cache-control: no-store`; body has no `objectKey`.
- `image/gif`, `byteSize` > max → 400 `VALIDATION_FAILED` with path `contentType` / `byteSize`.
- Happy path: put PNG bytes into `objects` → complete → 200 READY with the detected type and real size; complete again → 200 same (idempotent); list shows it; `content` returns the bytes with `content-type: image/png`, `cache-control: private, no-store`, `nosniff`.
- Declared `image/jpeg` but PNG bytes stored → READY with `image/png` (stored type comes from bytes).
- Text bytes (`<svg …>` / `%PDF`) → 415 `UNSUPPORTED_FILE_TYPE`, object deleted from `objects`, row REJECTED, not in list; complete again → 409 `MEDIA_UPLOAD_MISSING`.
- Object larger than `POST_IMAGE_MAX_BYTES` → 413 `FILE_TOO_LARGE`, object deleted, `get` never called (spy).
- Complete without upload → 409 `MEDIA_UPLOAD_MISSING`, row still PENDING_UPLOAD.
- Limit: 10 READY/pending → 11th slot → 409 `MEDIA_LIMIT_REACHED`; an expired pending row (set `uploadExpiresAt` in the past via Prisma) does not count. Concurrency: fire 5 slot requests in parallel at 8 existing → exactly 2 succeed.
- Delete → 204, row gone, object gone; delete again → 404; `failNext.delete` → still 204 (best-effort, row deleted).
- Isolation: creator B on A's post (slot, complete, list, content, delete) → 404 `NOT_FOUND` with the same body as an unknown uuid; A's media id under B's own post id → 404; nothing changes in DB/storage.
- Malformed `postId`/`mediaId` → 400; no cookie → 401; plain user → 403 `CREATOR_NOT_APPROVED`; POST with cookie and foreign `Origin` → 403 `FORBIDDEN`.

---

### TASK-047: Image upload on the studio post edit page

On `/studio/posts/[postId]` (US-015 page), below `<PostForm>`, add a "Gambar" section.

- **Fetcher** `apps/web/src/lib/api/studio-post-media.ts`: `getMyPostMedia(postId): Promise<StudioMediaList | null>` — same shape as `getMyPost` in `studio-posts.ts` (forward only the session cookie, `cache: 'no-store'`, parse with `studioMediaListSchema`, null on 400/401/403/404, throw otherwise).
- **Page:** the existing server component that loads the post also loads `getMyPostMedia(postId)` and renders `<PostImages postId={post.id} media={media.media} />`.
- **Client component** `apps/web/src/app/studio/posts/[postId]/post-images.tsx` (`'use client'`, modelled on `studio/profile/profile-image-input.tsx`):
  - Grid of READY images: `<img src="/api/v1/creators/me/posts/{postId}/media/{id}/content" alt="Gambar {n}">` (same-origin, the session cookie goes with it; plain `<img>` — not `next/image`, which would proxy/cache a private image) + "Hapus" button (`DELETE`, then `router.refresh()`).
  - `<input type="file" accept="image/jpeg,image/png,image/webp">` with a visible `<Label>` "Tambah gambar", hint "JPEG, PNG, atau WebP, maks. 10 MB · {n}/{POST_MEDIA_MAX_PER_POST}" (from shared constants); disabled at the limit or while uploading.
  - On select: client pre-check with `createMediaUploadSchema.safeParse({ contentType: file.type, byteSize: file.size })` (UX only; the server re-checks) → `POST …/media` → `fetch(upload.url, { method: 'PUT', headers: upload.headers, body: file })` (no `credentials` for absolute R2 URLs; same-origin local URLs send cookies by default, which is fine) → `POST …/media/{id}/complete` → `router.refresh()`. Status text "Mengunggah…" in an `aria-live="polite"` region; errors from the API body's `message` (or "Gagal mengunggah. Coba lagi." when the storage PUT fails) shown there. Reset the input after each attempt.
  - Mutating API calls use `credentials: 'include'` like `post-form.tsx`.
- Check `apps/web/next.config.ts` for a CSP / `images` config that would block `connect-src` to `*.r2.cloudflarestorage.com`; if a CSP exists, add the R2 origin only when `STORAGE_DRIVER=r2` is relevant (otherwise note it in README).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/lib/api/studio-post-media.ts` | `getMyPostMedia` |
| CREATE | `apps/web/src/lib/api/studio-post-media.test.ts` | fetcher tests |
| CREATE | `apps/web/src/app/studio/posts/[postId]/post-images.tsx` | upload/list/delete UI |
| CREATE | `apps/web/src/app/studio/posts/[postId]/post-images.test.tsx` | component tests |
| MODIFY | `apps/web/src/app/studio/posts/[postId]/page.tsx` | load media, render section |

**Testing** (Vitest + Testing Library; mock `fetch` / `next/navigation` as in `post-form.test.tsx`):
- `studio-post-media.test.ts`: forwards only the session cookie; no cookie → null without fetching; 401/403/404/400 → null; 500 → throws.
- `post-images.test.tsx`: renders one `<img>` per media with the content URL and alt; selecting a GIF or an 11 MB file shows the Bahasa error and makes no fetch; a valid file makes 3 calls in order (POST slot → PUT to `upload.url` with `upload.headers` and the file → POST complete) then `router.refresh()`; API 409 `MEDIA_LIMIT_REACHED` shows its message; failed storage PUT shows "Gagal mengunggah. Coba lagi." and skips complete; input disabled while uploading and at 10 images; "Hapus" sends DELETE and refreshes.
- Manual: `pnpm dev` (default `STORAGE_DRIVER=local`), dev-login as `claudia`, open a draft, upload a JPEG and a PNG → thumbnails; rename a `.txt` to `.jpg` and upload → "Format …" error from `complete`; delete one; `.local-storage/post-media/` holds the files; dev-login as `creatorB` and open Claudia's `…/media/<id>/content` URL → 404.
