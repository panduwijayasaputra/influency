# Technical Plan: US-048 — Safe Cover & Blurred Preview for Premium Posts

## Architecture Overview

A PREMIUM post can have one **cover**. The public only ever sees a server-generated **preview** of it: a separate WebP file built with `sharp` (downscale to ~32 px → upscale + blur → lossy WebP, metadata stripped). The original pixels are gone from that file, so no CSS trick reveals more.

Agreed decisions (planning session 2026-11-04):

- **Library:** `sharp` (Video Infrastructure v1 §4). Prebuilt `@img/sharp-*` binaries; its install script stays disabled in `allowBuilds`.
- **Cover sources:** (a) a READY image of the post, (b) a READY video of the post → provider **default** thumbnail fetched server-side (no frame picker), (c) a dedicated upload (raw `image/*` body, like the profile avatar).
- **Only the preview is stored.** A dedicated upload's original is not kept; changing the cover (or the setting) means choosing/uploading again.
- **TBD setting** `PREMIUM_COVER_CLEAR_ALLOWED` (env, default `false`). When `true`, only a **dedicated upload** is stored as a clear (downscaled, not blurred) preview. Post images and video frames are premium content and are always blurred. The setting applies when a preview is generated; existing previews are not regenerated.
- **Data:** two nullable columns on `posts`: `cover_media_id` (FK → `media_assets`, RESTRICT) and `preview_key` (`post-previews/<uuid>`, UNIQUE). Dedicated upload = `preview_key` set, `cover_media_id` null. CHECK: a media cover always has a preview.
- **Rules:** cover endpoints work for PREMIUM posts only (`COVER_REQUIRES_PREMIUM`), in **any status** (like caption and price), and swap the keys under the post-row lock. Not required for publishing. A cover left behind on a draft switched to FREE is ignored: feed and preview route only serve PREMIUM.
- **Public:** `PublicPost.previewUrl` = `/api/v1/creators/:slug/posts/:postId/preview/:previewId` (the preview's own uuid, never the source key/uid/media id), or `null` → the web shows a generic locked placeholder. The preview route only serves PUBLISHED PREMIUM posts of a visible creator and is immutable-cached (a new cover = a new URL).
- **Deleting the cover media** (DRAFT only, existing rule) clears the cover and its preview in the same transaction.

Studio API (all `ApprovedCreatorGuard`, owner-scoped, foreign/unknown = 404):

| Method | Path | Body | Result |
|--------|------|------|--------|
| PUT | `/creators/me/posts/:id/cover` | `{ mediaId }` (strict) | 200 `StudioPost` |
| PUT | `/creators/me/posts/:id/cover/image` | raw `image/*` (JPEG/PNG/WebP, ≤ 5 MiB) | 200 `StudioPost` |
| DELETE | `/creators/me/posts/:id/cover` | — | 200 `StudioPost` (idempotent) |
| GET | `/creators/me/posts/:id/cover/preview` | — | preview bytes, `private, no-store`, `nosniff`; none → 404 |

Public: `GET /creators/:slug/posts/:postId/preview/:previewId` → WebP, `public, max-age=31536000, immutable`, `nosniff`.

## Dependencies

- `sharp` in `apps/api` dependencies, exact version, published ≥ 2 weeks ago (`pnpm --filter @influency/api add sharp@<x.y.z> --save-exact`). Add to `pnpm-workspace.yaml` `allowBuilds`: `sharp: false` with a comment ("ships prebuilt @img/sharp-* binaries; install script only builds from source"). Make sure `pnpm install` works on Windows and that the lockfile includes `@img/sharp-linux-x64` (CI).
- Cloudflare Stream signed-token + thumbnail API. **Check the current official docs** before coding (CLAUDE.md rule): `POST /accounts/{account_id}/stream/{uid}/token` → `result.token`; thumbnail at `https://customer-<code>.cloudflarestream.com/<token>/thumbnails/thumbnail.jpg`. Note any difference in a code comment and the task's QA notes.

## Risks

- **CPU in the request path.** Decoding a 10 MiB photo takes ~100 ms. Acceptable for MVP. Add `// shortcut: preview generated in the request; move to the worker (Phase 5) if cover changes get slow.` Cap decode with `limitInputPixels` (40 MP).
- **Silhouettes survive a blur** (spec §4). Mitigation: very low sample resolution (32 px) + dedicated safe-cover upload. Moderation stays out of scope.
- **Orphaned preview objects** if the process dies between `put` and commit. Harmless private bytes; the US-049 cleanup can sweep `post-previews/` keys that no `posts.preview_key` references. Note it as a `shortcut:`.
- **Stream thumbnail of a `requireSignedURLs` video** needs a token. It is minted server-side, used once, and never logged or returned.
- **Prisma relation ambiguity:** a second `Post`↔`MediaAsset` relation means both relations need names. Renaming the existing one is schema-only (no SQL change). Check that the migration diff contains only the new columns.

## Tasks

### TASK-064: Shared cover contract

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/posts.ts` | constants + schemas below |
| MODIFY | `packages/shared/src/errors.ts` | 2 error codes |
| MODIFY | `packages/shared/src/posts.test.ts` | schema tests |

- `POST_COVER_MAX_BYTES = 5 * 1024 * 1024` — TBD placeholder comment, must stay ≤ the API's 5 MiB raw-image parser cap. Cover types reuse `POST_IMAGE_TYPES`.
- `setPostCoverSchema = z.strictObject({ mediaId: z.uuid() })`; `type SetPostCoverInput`.
- `postCoverSchema = z.object({ mediaId: z.string().nullable(), previewUrl: z.string() })`. `mediaId` is null for a dedicated upload.
- `studioPostSchema` gets `cover: postCoverSchema.nullable()`.
- `publicPostSchema` gets `previewUrl: z.string().nullable()`. Update its doc comment: "only the generated preview's URL for PREMIUM posts; never media ids, keys or provider ids".
- Errors (same Bahasa Indonesia style as `OFFER_REQUIRES_PREMIUM`):
  - `COVER_REQUIRES_PREMIUM` 409 "Sampul hanya bisa diatur untuk post Premium."
  - `COVER_SOURCE_UNAVAILABLE` 409 "Sampul belum bisa dibuat dari media ini. Coba lagi nanti."

**Testing:** `setPostCoverSchema` accepts a uuid and rejects a non-uuid, a missing `mediaId` and extra keys; `studioPostSchema` / `publicPostSchema` parse with `cover` / `previewUrl` null and set.

---

### TASK-065: Schema, env setting and preview generator

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/prisma/schema.prisma` | `Post.coverMediaId`, `Post.previewKey`, named relations |
| CREATE | `apps/api/prisma/migrations/<ts>_post_covers/migration.sql` | columns + FK + CHECK + index |
| MODIFY | `apps/api/src/common/env.ts` | `PREMIUM_COVER_CLEAR_ALLOWED` |
| MODIFY | `.env.example` | placeholder line with TBD comment |
| CREATE | `apps/api/src/common/preview-generator.ts` | `PreviewGenerator` |
| CREATE | `apps/api/src/common/preview-generator.spec.ts` | unit tests |
| MODIFY | `apps/api/src/common/common.module.ts` | provide + export `PreviewGenerator` |
| MODIFY | `apps/api/package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` | `sharp` |

**Schema** (doc comment `/// US-048 cover: …`):
```prisma
model Post {
  // …
  /// US-048: cover source when it is one of this post's media (null for a dedicated upload or no cover).
  coverMediaId String?     @map("cover_media_id") @db.Uuid
  /// US-048: generated public-safe preview `post-previews/<uuid>`; new key on every change. Never the source's key.
  previewKey   String?     @unique @map("preview_key")
  media        MediaAsset[] @relation("PostMedia")
  coverMedia   MediaAsset?  @relation("PostCover", fields: [coverMediaId], references: [id], onDelete: Restrict)
  @@index([coverMediaId])
}
model MediaAsset {
  post    Post   @relation("PostMedia", fields: [postId], references: [id], onDelete: Restrict)
  coverOf Post[] @relation("PostCover")
}
```
Generate the migration with `pnpm db:migrate --name post_covers`. Then add by hand:
`ALTER TABLE "posts" ADD CONSTRAINT "posts_cover_has_preview" CHECK ("cover_media_id" IS NULL OR "preview_key" IS NOT NULL);`
The schema-conventions spec must still pass.

**Env** (copy the `POST_MODERATION_REQUIRED` pattern):
```ts
// TBD placeholder (Video Infrastructure v1 §15.3): when true, a dedicated uploaded cover is public unblurred. Post media stays blurred.
PREMIUM_COVER_CLEAR_ALLOWED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
```

**`PreviewGenerator`** (`@Injectable()`, plain class, no DI deps):
```ts
/** Public-safe cover previews. The output is a new, transformed file; the source's detail can't be recovered from it. */
export class PreviewGenerator {
  /** Downscale to PREVIEW_SAMPLE_PX (destroys detail), upscale to PREVIEW_OUTPUT_PX with a blur, lossy WebP, no metadata. */
  async blurred(source: Uint8Array): Promise<Buffer>;
  /** Curated safe cover only (PREMIUM_COVER_CLEAR_ALLOWED): downscaled to CLEAR_COVER_PX, not blurred, WebP, no metadata. */
  async clear(source: Uint8Array): Promise<Buffer>;
}
```
- Constants at the top of the file, each a named placeholder: `PREVIEW_SAMPLE_PX = 32`, `PREVIEW_OUTPUT_PX = 320`, `PREVIEW_BLUR_SIGMA = 4`, `PREVIEW_WEBP_QUALITY = 40`, `CLEAR_COVER_PX = 640`, `CLEAR_WEBP_QUALITY = 70`, `MAX_INPUT_PIXELS = 40_000_000`.
- `blurred` needs two pipelines, because sharp applies one resize per pipeline:
  - Step 1: `sharp(source, { limitInputPixels: MAX_INPUT_PIXELS }).rotate().resize(PREVIEW_SAMPLE_PX, PREVIEW_SAMPLE_PX, { fit: 'inside' }).toBuffer()`
  - Step 2: `sharp(small).resize(PREVIEW_OUTPUT_PX, PREVIEW_OUTPUT_PX, { fit: 'inside' }).blur(PREVIEW_BLUR_SIGMA).webp({ quality: PREVIEW_WEBP_QUALITY }).toBuffer()`
- `clear`: `.rotate().resize(CLEAR_COVER_PX, CLEAR_COVER_PX, { fit: 'inside', withoutEnlargement: true }).webp({ quality: CLEAR_WEBP_QUALITY })`.
- Never call `withMetadata` / `keepMetadata`; sharp strips metadata by default.
- Undecodable input: sharp throws. Let it throw; callers map it to `UNSUPPORTED_FILE_TYPE`.

**Testing** (`preview-generator.spec.ts`; build sources with `sharp({ create: … })` / raw pixel buffers):
- `blurred` output starts with WebP magic (`RIFF….WEBP`), longest side ≤ 320, `metadata()` has no `exif`/`icc`/`xmp`.
- **Detail is destroyed:** a 512×512 1-px black/white checkerboard and a flat mid-gray (128) image give previews whose decoded raw pixels differ by mean abs < 4. The checkerboard source's stddev is ~128; the preview's stddev is < 10.
- Source with EXIF orientation 6 (rotated) → output is portrait (orientation applied, not just copied).
- `clear` keeps large features: a 1024×1024 image of 4 quadrants (black/white) → 640 px wide, and the quadrant colours are still distinct (stddev > 100). A 300 px source is not enlarged.
- Garbage bytes → rejects.

---

### TASK-066: Provider thumbnail for video covers

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/common/video-provider.ts` | `getThumbnail` on the interface |
| MODIFY | `apps/api/src/common/cloudflare-stream-video-provider.ts` | Stream implementation |
| MODIFY | `apps/api/src/common/cloudflare-stream-video-provider.spec.ts` | tests |
| MODIFY | `apps/api/src/common/stub-video-provider.ts` | generated frame |
| MODIFY | `apps/api/src/common/stub-video-provider.spec.ts` | tests |
| MODIFY | `apps/api/test/fake-video-provider.ts` | `thumbnails` map + `failNext.getThumbnail` |

Interface:
```ts
/** Default thumbnail frame bytes, fetched server-side (never a public URL). null while the video is missing or not ready. */
getThumbnail(uid: string): Promise<Uint8Array | null>;
```

**Stream** (follow the existing `request()` helper and the "errors carry the HTTP status only" rule):
1. `GET {baseUrl}/{uid}` (extend `videoSchema` with `thumbnail: z.url().nullish()`). 404 → `null`; state not `ready` → `null`.
2. Thumbnail origin = `new URL(result.thumbnail).origin`; throw unless the hostname ends with `.cloudflarestream.com`. This avoids a new customer-code env var.
3. `POST {baseUrl}/{uid}/token` with body `{ exp: <unix seconds now + 300> }` → `result.token` (zod-parse).
4. `fetch(`${origin}/${encodeURIComponent(token)}/thumbnails/thumbnail.jpg?height=720`, { signal: AbortSignal.timeout(10_000) })`. Non-ok → `throw new Error(\`Stream getThumbnail failed: ${status}\`)`. Read the body; more than `POST_IMAGE_MAX_BYTES` → throw.
5. Never put the token or thumbnail URL in an error or log.
- Verify against the current docs first (see Dependencies) and adjust the details if they differ.

**Stub:** `getThumbnail(uid)`: `getStatus(uid)` not `ready` → `null`; otherwise return a JPEG generated with `sharp({ create: { width: 640, height: 360, channels: 3, background: '#808080' } }).jpeg().toBuffer()`. A dev stand-in, since the stub can't decode video; say so in the doc comment.

**Fake** (`createFakeVideoProvider`): `thumbnails = new Map<string, Uint8Array>()`, `getThumbnail: (uid) => run('getThumbnail', () => thumbnails.get(uid) ?? null)`, add `'getThumbnail'` to `Op` / `failNext`, return `thumbnails`.

**Testing:**
- Stream spec (mock `fetch` like the existing spec): ready video → 3 calls in order (details, token POST with `exp`, thumbnail GET on the customer origin with the token in the path) → bytes; 404 → null; processing → null; thumbnail 403 → error message contains `403` and not the token; a body over the cap → throws; `thumbnail` on a foreign host → throws.
- Stub spec: before ready → null; once ready → bytes with JPEG magic.

---

### TASK-067: Studio cover API

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/posts/post-cover.service.ts` | `PostCoverService` |
| CREATE | `apps/api/src/modules/posts/post-cover.controller.ts` | 4 studio routes |
| MODIFY | `apps/api/src/modules/posts/posts.module.ts` | register both |
| MODIFY | `apps/api/src/modules/posts/posts.service.ts` | export `lockPost`; `cover` in `toStudioPost` |
| MODIFY | `apps/api/src/modules/posts/post-media.service.ts` | `remove` clears a cover pointing at the media |
| CREATE | `apps/api/src/modules/posts/post-cover.integration.spec.ts` | integration tests (fixed ids `0190a000-0000-7000-8000-00000023xxxx`) |

**`posts.service.ts`:**
- Move the private `lockPost` method to an exported module function `lockPost(tx, creatorProfileId, id)` with the same behaviour and return value (`{ status, visibility }`, NOT_FOUND when foreign/unknown). Update its callers in the class.
- `toStudioPost` adds `cover: row.previewKey ? { mediaId: row.coverMediaId, previewUrl: `${API_PREFIX}/creators/me/posts/${row.id}/cover/preview?v=${previewId(row.previewKey)}` } : null`. Use the same prefix form the profile `imageUrl` helper uses, plus a small exported `previewId(key)` that strips `post-previews/`. `?v=` only busts the browser cache.

**`PostCoverService`** (inject `PrismaService`, `OBJECT_STORAGE`, `VIDEO_PROVIDER`, `PreviewGenerator`, `ENV`, `PostsService`; `KEY_PREFIX = 'post-previews/'`):

```ts
setFromMedia(creatorProfileId: string, postId: string, mediaId: string): Promise<StudioPost>
setFromUpload(creatorProfileId: string, postId: string, body: unknown): Promise<StudioPost>
remove(creatorProfileId: string, postId: string): Promise<StudioPost>
preview(creatorProfileId: string, postId: string): Promise<StoredObject>
```

- `setFromMedia`:
  1. Owned post: `post.findFirst({ id, creatorProfileId })` → else NOT_FOUND. `visibility !== 'PREMIUM'` → `COVER_REQUIRES_PREMIUM`. This early check avoids processing; it is repeated under the lock.
  2. `mediaAsset.findFirst({ id: mediaId, postId, status: 'READY' })` → else NOT_FOUND. This also covers media of another post or another creator, and PENDING/PROCESSING/REJECTED media.
  3. Source bytes:
     - IMAGE: `storage.get(objectKey)` (null → `COVER_SOURCE_UNAVAILABLE`).
     - VIDEO: `video.getThumbnail(videoUid)`. null → `COVER_SOURCE_UNAVAILABLE`; a thrown error → log `cover thumbnail failed for media <id>: <message>` (never the uid) and throw `COVER_SOURCE_UNAVAILABLE`.
  4. `generator.blurred(bytes)` (post media is **always** blurred). A throw → `UNSUPPORTED_FILE_TYPE`.
  5. `swap(creatorProfileId, postId, preview, mediaId)`.
- `setFromUpload`: copy `CreatorProfileService.uploadImage` checks: `Buffer.isBuffer(body)` else `UNSUPPORTED_FILE_TYPE`; `detectImageType` ∈ `POST_IMAGE_TYPES` else `UNSUPPORTED_FILE_TYPE`; `> POST_COVER_MAX_BYTES` → `FILE_TOO_LARGE { maxBytes }`. Do the owned-post + PREMIUM pre-check (step 1), then `env.PREMIUM_COVER_CLEAR_ALLOWED ? generator.clear(body) : generator.blurred(body)` (throw → `UNSUPPORTED_FILE_TYPE`), then `swap(..., preview, null)`.
- `private swap(creatorProfileId, postId, preview: Buffer, mediaId: string | null)` — **transaction boundary:**
  1. `key = KEY_PREFIX + randomUUID()`; `storage.put(key, preview, 'image/webp')` **before** the transaction, so the lock isn't held over storage I/O.
  2. `prisma.$transaction(tx => { lockPost(tx, …); re-check visibility PREMIUM; if mediaId, re-check the media is still READY on this post (media delete takes the same lock); old = post.previewKey; tx.post.update({ coverMediaId: mediaId, previewKey: key }); return old })`.
  3. On a transaction error: best-effort delete `key`, rethrow. After commit: best-effort delete `old` (log the key like `deleteObject` in `post-media.service.ts`).
  4. Return `posts.get(creatorProfileId, postId)`.
  - Because of the lock, two concurrent swaps serialize. The second sees the first's key as `old` and deletes it, so no preview is orphaned.
- `remove`: transaction with `lockPost` (no PREMIUM check: clearing is always allowed) → `old` → set both columns null. After commit, best-effort delete `old`. Return `get`. Idempotent.
- `preview`: owned post with `previewKey` → `storage.get` → `{ body, contentType: 'image/webp' }`; else NOT_FOUND.
- Comment: `// shortcut: preview generated in the request; move to the worker (Phase 5) if cover changes get slow.` and `// shortcut: a crash between put and commit orphans one private preview; US-049 cleanup can sweep unreferenced post-previews/ keys.`

**`PostMediaService.remove`:** inside the existing transaction, after finding `media` and before `tx.mediaAsset.delete`:
```ts
const cover = await tx.post.findFirst({ where: { id: postId, coverMediaId: media.id }, select: { previewKey: true } });
if (cover) await tx.post.update({ where: { id: postId }, data: { coverMediaId: null, previewKey: null } });
```
After commit, best-effort `deleteObject(cover.previewKey)` alongside `cleanup(row)`. The RESTRICT FK makes sure no path forgets this.

**`PostCoverController`** (`@Controller('creators/me/posts')`, `@UseGuards(ApprovedCreatorGuard)`, `:id` through the same uuid pipe `PostsController` uses):
- `@Put(':id/cover')` body `new ZodValidationPipe(setPostCoverSchema)`.
- `@Put(':id/cover/image')` raw `@Body() body: unknown`. The global `image/*` parser gives a Buffer and 413 over 5 MiB.
- `@Delete(':id/cover')`.
- `@Get(':id/cover/preview')`: copy the profile image handler. Headers `content-type`, `cache-control: private, no-store`, `x-content-type-options: nosniff`.

**Testing** (`post-cover.integration.spec.ts`; `createMemoryStorage()` + `createFakeVideoProvider()` overrides; build source images with sharp):
- From image: 200 `cover.mediaId` = media id, `cover.previewUrl` matches `/cover/preview?v=<uuid>`. The stored `post-previews/…` object is WebP ≤ 320 px and differs from the original. The DB `preview_key` ≠ the image's `object_key`.
- From video: set `fake.thumbnails` → 200. No thumbnail → 409 `COVER_SOURCE_UNAVAILABLE`. `failNext.getThumbnail` → 409, and the log has no uid.
- FREE post → 409 `COVER_REQUIRES_PREMIUM` (both PUTs). Foreign post → 404. Media of another post of the same creator → 404. PENDING_UPLOAD / REJECTED media → 404. Non-uuid `mediaId` / extra key → 400.
- Upload: PNG → 200 with `mediaId: null`. JSON body → 415. `text/plain`-looking bytes as `image/png` → 415. > 5 MiB → 413. Undecodable bytes with valid magic → 415.
- `PREMIUM_COVER_CLEAR_ALLOWED=true` (separate app instance with the env override): a 1024 px upload → preview 640 px wide. A **media** cover in the same instance is still ≤ 320 px (always blurred).
- Replace cover → new `preview_key`; the old object is gone from storage.
- **Concurrency:** two parallel `PUT cover` calls → both 200. The final `preview_key` object exists and it is the only `post-previews/` object for that post.
- Works on a PUBLISHED and an ARCHIVED post (any status).
- DELETE → `cover: null`, object deleted; a second DELETE → 200.
- Deleting the cover media in DRAFT → the post's `cover` is null and the preview object is deleted. Deleting other media leaves the cover alone.
- `GET …/cover/preview` → 200 `image/webp`, `private, no-store`, `nosniff`; no cover → 404; foreign → 404.
- DB CHECK: a raw `UPDATE posts SET cover_media_id = <id>, preview_key = NULL` fails.

---

### TASK-068: Public preview in the feed + public preview route

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/modules/posts/public-posts.service.ts` | `previewUrl`, `getPreview` |
| MODIFY | `apps/api/src/modules/posts/public-posts.controller.ts` | preview route |
| MODIFY | `apps/api/src/modules/posts/public-posts.integration.spec.ts` | tests |

- `list`: select the creator's `slug` too. Per row: `previewUrl: row.visibility === 'PREMIUM' && row.previewKey ? `${API_PREFIX}/creators/${creator.slug}/posts/${row.id}/preview/${previewId(row.previewKey)}` : null`. Use the same URL prefix form as `toStudioPost` / profile `imageUrl`.
- `getPreview(slug, postId, previewId)`: both ids must pass `z.uuid()` else NOT_FOUND. Then `post.findFirst({ where: { id: postId, previewKey: 'post-previews/' + previewId, visibility: 'PREMIUM', status: 'PUBLISHED', creatorProfile: { slug: slug.toLowerCase(), ...PUBLIC_CREATOR } }, select: { id: true } })` → else NOT_FOUND → `storage.get` (null → NOT_FOUND) → `{ body, contentType: 'image/webp' }`. Inject `OBJECT_STORAGE`.
- Controller: `@Get(':slug/posts/:postId/preview/:previewId')` sets `content-type`, `cache-control: public, max-age=31536000, immutable`, `x-content-type-options: nosniff` (copy the profile image handler). It doesn't collide with `me/posts/:id/cover/preview`: the 4th segment differs (`preview` vs `cover`).
- Doc comment on the service: "Media is counted, never referenced; premium posts expose only the generated preview."

**Testing:**
- PREMIUM PUBLISHED post with a cover → `previewUrl` matches the pattern. GET it → 200 WebP + immutable + nosniff, and the bytes equal the stored preview.
- `JSON.stringify(feed)` contains no media id, `object_key`, `video_uid` or `post-media/` / `post-previews/` substring. The preview uuid only appears inside `previewUrl`.
- PREMIUM without a cover → `previewUrl: null`. A DRAFT switched to FREE that still has a cover, once published → `previewUrl: null`, and the preview route → 404.
- Preview route 404s: an old previewId after a cover change, DRAFT / ARCHIVED / PENDING_REVIEW post, suspended or unapproved creator, wrong slug, malformed ids.

---

### TASK-069: Studio "Sampul" UI

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/app/studio/posts/[postId]/post-cover.tsx` | cover section |
| CREATE | `apps/web/src/app/studio/posts/[postId]/post-cover.test.tsx` | tests |
| MODIFY | `apps/web/src/app/studio/posts/[postId]/page.tsx` | render `PostCover` for PREMIUM posts (any status), pass `cover` to `PostMedia` |
| MODIFY | `apps/web/src/app/studio/posts/[postId]/post-media.tsx` | "Jadikan sampul" + "Sampul" badge |
| MODIFY | `apps/web/src/app/studio/posts/[postId]/post-media.test.tsx` | tests |

Follow the mutation pattern of `post-offer-form.tsx` / `post-status-actions.tsx`: fetch to `/api/v1/...`, show API error messages, refresh the server data after success.

- `PostCover({ postId, cover })` — a section headed "Sampul":
  - If `cover`: `<img src={cover.previewUrl} alt="Pratinjau sampul" …>` + caption "Ini yang dilihat pengunjung sebelum membuka post." Otherwise: "Belum ada sampul. Pengunjung melihat gambar terkunci."
  - A file input "Unggah sampul" (`accept` = `POST_IMAGE_TYPES`, hint "JPEG, PNG atau WebP, maks. 5 MB"). It sends `PUT /api/v1/creators/me/posts/:id/cover/image` with `body: file` and `content-type: file.type`. Check the size on the client with `POST_COVER_MAX_BYTES` (UX only).
  - "Hapus sampul" (when there is a cover) → `DELETE`.
  - Status text in an `aria-live="polite"` element, like `post-media.tsx`.
- `PostMedia` gets `visibility` and `coverMediaId`. For PREMIUM posts, each READY card has a "Jadikan sampul" button → `PUT …/cover` `{ mediaId }`. The card whose id equals `coverMediaId` shows a "Sampul" badge instead. These buttons show **even when `locked`** (cover changes are allowed in any status). Never for FREE posts.

**Testing:** PostCover renders the preview / empty state; upload sends a PUT with the file and its content type; an oversized file is blocked client-side; an API error message is shown; Hapus sends DELETE. PostMedia: "Jadikan sampul" sends `{ mediaId }`; badge on the cover card; button present while locked; absent for FREE.

---

### TASK-070: Public feed shows preview or locked placeholder

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/creator-posts.tsx` | preview image / placeholder on premium cards |
| MODIFY | `apps/web/src/app/(public)/[creatorSlug]/creator-posts.test.tsx` | tests |

- Premium card: if `post.previewUrl`, `<img src={post.previewUrl} alt="" loading="lazy" className="aspect-square w-full object-cover" />` (decorative; the card text says what it is). Otherwise a same-size muted block with the existing lock icon (generic locked placeholder). **No CSS blur is needed or relied on**; the file is already blurred. Free cards stay as they are.

**Testing:** previewUrl → an `img` with that `src`; null → placeholder with the lock and no `img`; the free card has neither.

---

**Docs (done by `/dev-team` when the story completes):** update `codebase-map.md` (posts columns, endpoints, `PreviewGenerator`, `VideoProvider.getThumbnail`, `PREMIUM_COVER_CLEAR_ALLOWED`, test id range `23`).
