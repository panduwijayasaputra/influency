# Technical Plan: US-012 — Creator Edits Profile

## Architecture Overview

An approved creator edits their profile at `/studio/profile`. Text fields go through `PATCH /creators/me` (handoff §11.2). Avatar and banner are uploaded as raw bytes to the API (`PUT /creators/me/avatar|banner`). The API checks type by magic bytes and size, then writes the object to a **private Cloudflare R2 bucket** through a small `ObjectStorage` seam. Public visitors get the images from the API (`GET /creators/:slug/images/:imageId`), which streams them from R2. The bucket never gets a public URL.

Decisions agreed with the user (2026-11-03):

- **Upload path:** browser → API → R2 (server-side `PutObject`), not presigned direct uploads. Only the R2 adapter is built now, via `aws4fetch`. Tests override the `OBJECT_STORAGE` token with an in-memory fake, the same pattern as `TELEGRAM_OIDC_CLIENT`. US-016 adds presigned URLs and the local dev adapter behind the same interface.
- **Public view:** this story only adds the public image endpoint. US-013 builds `GET /creators/:slug` and the page, and reads the same columns plus `avatarUrl` / `bannerUrl`. AC 2 is verified through the API (`GET /creators/me` and the public image endpoint) and the Studio preview.
- **EXIF / resize:** skipped. Original bytes are stored once the type/size check passes. This is recorded as `shortcut:` debt plus a risk (GPS metadata in photos), to be handled with US-016 image processing.
- **Ownership by construction:** every write is on `/creators/me` and uses `req.creatorProfileId` from `ApprovedCreatorGuard`. No profile id is ever taken from the client.
- **Slug is not editable** (the rename policy is TBD).
- **Limits [TBD placeholders]:** avatar ≤ 2 MiB, banner ≤ 5 MiB, JPEG / PNG / WebP only. These are shared constants labeled as placeholders.
- **Image URLs are versioned by key:** each upload gets a fresh random `imageId`, so the URL changes on every upload and can be cached `immutable`. The old object is deleted best-effort after the DB update.
- Not in scope: removing an avatar or banner without replacing it, EXIF stripping/resizing, upload rate limiting (no rate limiter exists yet; handoff §12.1, to be added together with auth/purchase limits), the public profile JSON and page (US-013).

## Dependencies

- New API dependency: `aws4fetch` **1.0.20** (exact pin, published 2024-08, zero dependencies, AWS SigV4 over `fetch`; Cloudflare documents it for R2). Install with `pnpm --filter @influency/api add aws4fetch@1.0.20 --save-exact`. It has no install script, so `allowBuilds` needs no change.
- Required env vars (already placeholders in `.env.example`): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. A real R2 bucket + API token (Object Read & Write, scoped to that bucket) are needed to try uploads manually. Tests and CI use the fake.

## Risks

- **EXIF/GPS in uploaded photos** can reveal a creator's location. Mitigation for now: documented debt (`shortcut:` comment in the upload service) and a risk entry here. Fix in US-016 (re-encode/strip).
- **Next.js rewrite proxy body size.** Uploads go through the `/api/v1` rewrite in `apps/web/next.config.ts`. Mitigation: manually test a ~5 MB banner through `pnpm dev`. If the proxy truncates or rejects it, raise the relevant Next limit in `next.config.ts` (check the bundled Next 16 docs in `apps/web/AGENTS.md` for the exact option) and note it in the QA report.
- **Polyglot/malformed files** (valid magic bytes, junk after them). Stored bytes are served only with the detected content type plus `x-content-type-options: nosniff` and `content-disposition: inline`, so the browser never executes them as HTML/script. The image is never decoded server-side.
- **Concurrent uploads of the same kind** can orphan one R2 object (both read the same old key). They never delete the live one. Accepted; noted as `shortcut:`.
- **Placeholder R2 credentials in dev** let the API boot, but uploads then fail with 500 `INTERNAL_ERROR`. Documented in README run instructions.

## Tasks

### TASK-035: Profile image columns, shared profile contracts and error codes

**Prisma** (`apps/api/prisma/schema.prisma`, `CreatorProfile`; update its `///` doc: "US-012 adds avatar/banner keys"):

```prisma
avatarKey String? @map("avatar_key")   // R2 object key, e.g. "profile-images/<uuid>"; null = none
bannerKey String? @map("banner_key")
```

Migration: `pnpm --filter @influency/api exec prisma migrate dev --name creator_profile_images` (plain nullable columns, no backfill), then `pnpm --filter @influency/api generate`. The `profileFields()` helper needs no change (the columns are nullable).

**Shared** (`packages/shared/src/creators.ts`):

```ts
/** Placeholder limits (TBD business decision): allowed types and max bytes per profile image. */
export const PROFILE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ProfileImageType = (typeof PROFILE_IMAGE_TYPES)[number];
export const PROFILE_IMAGE_MAX_BYTES = { avatar: 2 * 1024 * 1024, banner: 5 * 1024 * 1024 } as const;
export type ProfileImageKind = keyof typeof PROFILE_IMAGE_MAX_BYTES;

/** Body of PATCH /creators/me: any subset of the editable fields; '' clears bio/category. */
export const updateCreatorProfileSchema = creatorApplicationSchema
  .pick({ displayName: true, bio: true, category: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Tidak ada perubahan.');
export type UpdateCreatorProfileInput = z.infer<typeof updateCreatorProfileSchema>;

/** GET/PATCH /creators/me and the upload endpoints. URLs are relative API paths, or null. */
export const creatorProfileResponseSchema = z.object({
  slug: z.string(),
  displayName: z.string(),
  bio: z.string().nullable(),
  category: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  bannerUrl: z.string().nullable(),
});
export type CreatorProfileResponse = z.infer<typeof creatorProfileResponseSchema>;
```

If `.refine` on a picked object conflicts with how `ZodValidationPipe` reports issue paths, keep it anyway: a form-level issue with an empty path is fine.

**Errors** (`packages/shared/src/errors.ts`):
- `UNSUPPORTED_FILE_TYPE: { status: 415, message: 'Format file tidak didukung. Gunakan JPG, PNG, atau WebP.' }`
- `FILE_TOO_LARGE: { status: 413, message: 'Ukuran file terlalu besar.' }`

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/prisma/schema.prisma` | `avatarKey`, `bannerKey` |
| CREATE | `apps/api/prisma/migrations/<ts>_creator_profile_images/migration.sql` | Nullable columns |
| MODIFY | `packages/shared/src/creators.ts` | Image limits, update + response schemas |
| MODIFY | `packages/shared/src/creators.test.ts` | Schema tests |
| MODIFY | `packages/shared/src/errors.ts` | `UNSUPPORTED_FILE_TYPE`, `FILE_TOO_LARGE` |

**Testing (`creators.test.ts`):**
- `updateCreatorProfileSchema`: `{}` fails; `{ displayName: '  Nama  ' }` → trimmed; `displayName: ''` fails; `bio` 501 chars fails; `{ bio: '' }` passes (the service turns it into null); unknown keys such as `slug` are stripped and not applied (assert the parsed output has no `slug`).
- `creatorProfileResponseSchema` accepts null URLs.

---

### TASK-036: R2 object storage seam, env vars, image body parsing and error mapping

**Storage interface** `apps/api/src/common/object-storage.ts`:

```ts
export interface StoredObject { body: Uint8Array; contentType: string }
export interface ObjectStorage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;   // null on 404
  delete(key: string): Promise<void>;               // idempotent (404 is fine)
}
export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
```

**R2 adapter** `apps/api/src/common/r2-object-storage.ts`, `class R2ObjectStorage implements ObjectStorage`:
- Constructor takes `Env`; `this.client = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' })`; base URL `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/` (path-style).
- `put`: `client.fetch(url(key), { method: 'PUT', body, headers: { 'content-type': contentType } })`; throw `new Error('R2 put failed: ' + status)` if not ok. Status only: never include the URL or headers in errors or logs (they carry signatures).
- `get`: GET; 404 → `null`; not ok → throw; else `{ body: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get('content-type') ?? 'application/octet-stream' }`.
- `delete`: DELETE; ok or 404 → resolve; else throw.
- `url(key)` must `encodeURIComponent` each path segment of the key.
- Comment: `// shortcut: buffers whole objects in memory (≤5 MiB profile images); stream when US-016/017 handle larger media.`

Register it in `CommonModule` (global): `{ provide: OBJECT_STORAGE, useFactory: (env: Env) => new R2ObjectStorage(env), inject: [ENV] }`, and export `OBJECT_STORAGE`.

**Test fake** `apps/api/test/memory-storage.ts`: `createMemoryStorage()` returns an `ObjectStorage` backed by a `Map`, plus the map itself for assertions. Specs use `Test.createTestingModule({ imports: [AppModule] }).overrideProvider(OBJECT_STORAGE).useValue(fake)` (pattern in the codebase map).

**Env** (`apps/api/src/common/env.ts`): add `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, each `z.string().min(1)`, with a comment `// Cloudflare R2 (private bucket); API token scoped to this bucket.` Add placeholders to `apps/api/vitest.config.ts` `env` and the CI workflow env (`.github/workflows/ci.yml`). Update `env.spec.ts` (missing R2 var → listed in the error). `.env.example` already has the keys; add a one-line comment that a real bucket is needed for uploads.

**Image body parser** (`apps/api/src/app.factory.ts` → `configureApp`):

```ts
// Raw image uploads (PUT /creators/me/avatar|banner); per-kind limits are checked in the service.
fastify.addContentTypeParser(/^image\//, { parseAs: 'buffer', bodyLimit: PROFILE_IMAGE_MAX_BYTES.banner }, (_req, body, done) => done(null, body));
```

**Error mapping** (`apps/api/src/common/all-exceptions.filter.ts`, `fastifyClientErrorCode`): `statusCode === 413` → `'FILE_TOO_LARGE'`, `415` → `'UNSUPPORTED_FILE_TYPE'`, before the generic 4xx → `VALIDATION_FAILED` fallback.

**Magic-byte check** `apps/api/src/common/image-type.ts`:

```ts
/** Detects the image type from file content (never from the name or client content-type). */
export function detectImageType(bytes: Uint8Array): ProfileImageType | null
// JPEG: FF D8 FF; PNG: 89 50 4E 47 0D 0A 1A 0A; WebP: "RIFF" at 0 and "WEBP" at 8. Anything else → null.
```

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/package.json` (+ `pnpm-lock.yaml`) | `aws4fetch` 1.0.20 |
| CREATE | `apps/api/src/common/object-storage.ts` | Interface + token |
| CREATE | `apps/api/src/common/r2-object-storage.ts` | R2 adapter |
| CREATE | `apps/api/src/common/r2-object-storage.spec.ts` | Adapter unit tests (fetch stubbed) |
| CREATE | `apps/api/src/common/image-type.ts` (+ `.spec.ts`) | Magic-byte detection |
| CREATE | `apps/api/test/memory-storage.ts` | In-memory fake |
| MODIFY | `apps/api/src/common/common.module.ts` | Provide/export `OBJECT_STORAGE` |
| MODIFY | `apps/api/src/common/env.ts`, `env.spec.ts` | R2 vars |
| MODIFY | `apps/api/vitest.config.ts`, `.github/workflows/ci.yml`, `.env.example` | Placeholders |
| MODIFY | `apps/api/src/app.factory.ts` | `image/*` buffer parser |
| MODIFY | `apps/api/src/common/all-exceptions.filter.ts` (+ its spec) | 413/415 mapping |

**Testing:**
- `image-type.spec.ts`: JPEG/PNG/WebP headers detected; GIF (`GIF89a`), SVG text (`<svg`), `RIFF....WAVE`, a PDF header, empty and 3-byte buffers → null.
- `r2-object-storage.spec.ts` (`vi.stubGlobal('fetch', …)`; check how `aws4fetch` calls `fetch` and stub accordingly): put sends PUT to `https://<acct>.r2.cloudflarestorage.com/<bucket>/profile-images/<id>` with `content-type` and an `authorization` header starting with `AWS4-HMAC-SHA256`; get 404 → null; get 200 returns bytes + content type; delete 404 resolves; put 500 throws an error whose message contains no URL/signature.
- Filter spec: a Fastify error with `statusCode` 413 / 415 and an `FST_` code maps to `FILE_TOO_LARGE` / `UNSUPPORTED_FILE_TYPE`.
- `env.spec.ts`: missing `R2_BUCKET` is reported.

---

### TASK-037: Profile edit and image API (`GET`/`PATCH /creators/me`, `PUT /creators/me/avatar|banner`, public image GET)

Extend the existing `creators` module. The controller currently has `@UseGuards(SessionGuard)` on the class; move it to the two existing methods so the new routes can use other guards. Put the profile logic in a new `apps/api/src/modules/creators/creator-profile.service.ts` (`CreatorProfileService`) and leave `CreatorsService` focused on applications.

**Routes** (in `creators.controller.ts`, or a second `creator-profile.controller.ts` with `@Controller('creators')`; either is fine, but route order matters: register the `me` routes before `:slug/images/:imageId`):

| Method | Path | Guard | Behavior |
|--------|------|-------|----------|
| GET | `me` | `ApprovedCreatorGuard` | `cache-control: no-store` → `CreatorProfileResponse` |
| PATCH | `me` | `ApprovedCreatorGuard` | `@Body(new ZodValidationPipe(updateCreatorProfileSchema))` → `CreatorProfileResponse` |
| PUT | `me/:kind` | `ApprovedCreatorGuard` | `kind` via `ZodValidationPipe(z.enum(['avatar','banner']))`, raw `@Body() body: unknown` → `CreatorProfileResponse` |
| GET | `:slug/images/:imageId` | Public | Streams the image |

`me` has 2 chars, so it can never be a slug (minimum 3); no collision with the future `GET /creators/:slug`.

**Service** (inject `PrismaService`, `OBJECT_STORAGE`):

```text
toResponse(row): { slug, displayName, bio, category,
  avatarUrl: row.avatarKey ? `/api/v1/creators/${slug}/images/${imageId(row.avatarKey)}` : null, bannerUrl: same }
  // imageId(key) = key after 'profile-images/'; build the prefix from API_PREFIX

getMine(profileId) → findUniqueOrThrow({ where: { id: profileId } }) → toResponse

update(profileId, input):
  data = { ...(displayName !== undefined && { displayName }),
           ...(bio !== undefined && { bio: bio || null }), ...(category !== undefined && { category: category || null }) }
  update({ where: { id: profileId }, data }) → toResponse         // only these three fields, never slug/status/keys

uploadImage(profileId, kind, body: unknown):
  if !Buffer.isBuffer(body) → DomainError('UNSUPPORTED_FILE_TYPE')   // e.g. JSON body
  type = detectImageType(body); if !type → DomainError('UNSUPPORTED_FILE_TYPE')
  if body.length > PROFILE_IMAGE_MAX_BYTES[kind] → DomainError('FILE_TOO_LARGE', { maxBytes })
  column = kind === 'avatar' ? 'avatarKey' : 'bannerKey'
  old = findUniqueOrThrow({ where: { id: profileId }, select: { [column]: true } })[column]
  key = `profile-images/${randomUUID()}`
  await storage.put(key, body, type)                  // detected type, never the client header
  row = update({ where: { id: profileId }, data: { [column]: key } })
  if old: storage.delete(old).catch((err) => logger.warn({ err: err.message }, 'profile image cleanup failed'))
  // shortcut: concurrent uploads of one kind can orphan an R2 object; add a sweep job if storage cost matters.
  // shortcut: originals stored as uploaded (EXIF/GPS kept); strip/re-encode with US-016 image processing.
  return toResponse(row)

getPublicImage(slug, imageId):
  imageId must match z.uuid() else NOT_FOUND
  key = `profile-images/${imageId}`
  profile = findFirst({ where: { slug: slug.toLowerCase(), status: 'APPROVED',
                                 OR: [{ avatarKey: key }, { bannerKey: key }] }, select: { id: true } })
  if !profile → DomainError('NOT_FOUND')               // unapproved creators and replaced images are not served
  obj = storage.get(key); if !obj → NOT_FOUND
```

Public GET reply: `reply.header('content-type', obj.contentType)`, `cache-control: public, max-age=31536000, immutable`, `x-content-type-options: nosniff`, `content-disposition: inline`, then send `Buffer.from(obj.body)`. Use `@Res({ passthrough: true })` or return a `StreamableFile`; pick whichever works with Nest 12 + Fastify and keeps the error filter working for the 404 path.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/creators/creator-profile.service.ts` | Get / update / upload / public image |
| CREATE or MODIFY | `apps/api/src/modules/creators/creator-profile.controller.ts` / `creators.controller.ts` | Routes; per-method guards |
| MODIFY | `apps/api/src/modules/creators/creators.module.ts` | Register service/controller |
| CREATE | `apps/api/src/modules/creators/creator-profile.integration.spec.ts` | Integration tests |

**Testing (`creator-profile.integration.spec.ts`; real app built with `Test.createTestingModule` + `overrideProvider(OBJECT_STORAGE)` with `createMemoryStorage()`, then `createNestApplication(createFastifyAdapter({ logger: false }))` + `configureApp`; own fixed user ids for creator A (APPROVED), creator B (APPROVED), a PENDING_REVIEW applicant and a plain user, with `profileFields()` and session tokens like `me.integration.spec.ts`; `origin: WEB_ORIGIN` on PATCH/PUT; cleanup in `afterAll`):**
- No cookie → 401 on GET/PATCH/PUT `me`; plain user and PENDING_REVIEW applicant → 403 `CREATOR_NOT_APPROVED`, row unchanged.
- PATCH `{ displayName: '  Baru  ', bio: 'Halo', category: '' }` → 200, displayName `Baru`, category null; DB matches; GET `me` returns the same.
- PATCH with `slug`, `status`, `avatarKey` or `userId` in the body → those columns unchanged (only the allowed fields are applied).
- **Isolation:** creator A's PATCH/PUT never touches creator B's row (assert B unchanged after A's calls). No route accepts a profile id.
- PATCH `{}` and `displayName: ''` → 400 `VALIDATION_FAILED`.
- PUT avatar with PNG bytes (`content-type: image/png`) → 200, `avatarUrl` = `/api/v1/creators/<slug>/images/<uuid>`, the fake holds the key with `image/png`.
- PUT banner with JPEG bytes but `content-type: image/png` → stored as `image/jpeg` (the detected type wins).
- PUT with GIF bytes (`image/gif`), with an SVG (`image/svg+xml`), and with PNG magic under a `.jpg`-like label → GIF/SVG get 415 `UNSUPPORTED_FILE_TYPE`; `content-type: text/plain` → 415; a JSON body → 415.
- PUT avatar of 2 MiB + 1 byte (valid PNG header + padding) → 413 `FILE_TOO_LARGE`; banner of 5 MiB + 1 → 413 (Fastify body limit). Banner of 3 MiB → 200. In every rejection, nothing is stored and the key is unchanged.
- Second avatar upload → a new key; the old object is deleted from the fake; a delete failure (fake throws) still returns 200.
- Storage `put` throws → 500 `INTERNAL_ERROR`, DB key unchanged.
- Public GET of the current avatar URL (no cookie) → 200, right content-type, `cache-control` immutable, `nosniff`, identical bytes; slug in uppercase also works.
- Public GET with the old (replaced) imageId → 404; creator B's slug with creator A's imageId → 404; PENDING_REVIEW profile's image → 404; non-uuid imageId → 404.
- Missing `Origin` with cookie on PATCH/PUT → 403 `FORBIDDEN` (CSRF).

---

### TASK-038: `/studio/profile` edit page

**Data helper** `apps/web/src/lib/api/creator-profile.ts`: `getMyCreatorProfile()`, server only, same pattern as `creator-application.ts` (forward only the session cookie, `cache: 'no-store'`). It calls `GET /api/v1/creators/me`, parses with `creatorProfileResponseSchema`, and returns `null` on 401/403.

**Page** `apps/web/src/app/studio/profile/page.tsx` (already gated by `studio/layout.tsx` → `StudioGate`): a server component with its content inside `<Suspense>` (cacheComponents). Heading "Edit Profil". Shows `influency.com/{slug}` (read-only, with the muted note "Alamat halaman belum dapat diubah."), then `<ProfileImageInput kind="banner" … />`, `<ProfileImageInput kind="avatar" … />`, and `<CreatorProfileForm profile={…} />`.

**`creator-profile-form.tsx`** (`"use client"`): fields Nama tampilan, Bio (textarea), Kategori, prefilled. On submit it validates with `updateCreatorProfileSchema.safeParse`, then `fetch('/api/v1/creators/me', { method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body })`. The button is disabled while pending. On 200 → status message "Profil disimpan." (`role="status"`) + `router.refresh()`. Errors are parsed with `errorResponseSchema`: `VALIDATION_FAILED` → map `details.issues` by path to fields; anything else → form-level `role="alert"`. Follow `creator-application-form.tsx` for structure and a11y (`aria-invalid`, `aria-describedby`).

**`profile-image-input.tsx`** (`"use client"`, props `kind: ProfileImageKind`, `url: string | null`, `label`):
- Preview: banner is a wide `<img>` (aspect ~3:1, `object-cover`), avatar is round. Use a muted placeholder when `url` is null. Use a plain `<img>`, not `next/image`, because the API URL is same-origin through the rewrite. If ESLint's `@next/next/no-img-element` complains, disable that rule for this line with a one-line reason.
- A labeled `<input type="file" accept="image/jpeg,image/png,image/webp">`. On change it pre-checks `file.type ∈ PROFILE_IMAGE_TYPES` and `file.size ≤ PROFILE_IMAGE_MAX_BYTES[kind]`, showing friendly errors with the MB limit. This is UX only; the server is authoritative. It then sends `fetch('/api/v1/creators/me/' + kind, { method: 'PUT', credentials: 'include', headers: { 'content-type': file.type }, body: file })`.
- While pending, the input is disabled and "Mengunggah…" is shown. On 200 → `router.refresh()`. On 413/415 → show `error.message`; other errors → generic `role="alert"`.

**Studio home** `apps/web/src/app/studio/page.tsx`: add a link "Edit profil" → `/studio/profile`.

**Reserved routes:** none (under `/studio`).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/lib/api/creator-profile.ts` | `getMyCreatorProfile()` |
| CREATE | `apps/web/src/app/studio/profile/page.tsx` | Edit page |
| CREATE | `apps/web/src/app/studio/profile/creator-profile-form.tsx` (+ `.test.tsx`) | Text fields |
| CREATE | `apps/web/src/app/studio/profile/profile-image-input.tsx` (+ `.test.tsx`) | Avatar/banner upload |
| CREATE | `apps/web/src/app/studio/profile/page.test.tsx` | Renders with mocked helper |
| MODIFY | `apps/web/src/app/studio/page.tsx` | "Edit profil" link |
| MODIFY | `README.md` | R2 bucket/token setup for uploads (placeholders fail at upload time) |

**Testing (Vitest + Testing Library, `fetch` + `next/navigation` mocked):**
- Page: shows the slug URL read-only and prefilled fields; null image URLs show placeholders.
- Form: empty display name shows an error without fetching; a valid save sends PATCH with JSON and calls `router.refresh()`; `VALIDATION_FAILED` issues map to fields; button disabled while pending.
- Image input: a `.gif` file shows the type error without fetching; an avatar over 2 MB shows the size error without fetching; a valid PNG sends PUT to `/api/v1/creators/me/avatar` with `content-type: image/png` and the file as body, then refreshes; an API 415 shows its message; the input is disabled while pending.
- Manual (QA report): with real R2 credentials, `pnpm dev`, log in as Claudia via dev login, upload a ~4.5 MB banner and an avatar, edit the bio, then open the returned image URL in a logged-out window → it loads.
