# Codebase Map

> Overview of what currently exists in Influency. Keep in sync when adding modules, models, endpoints or routes (`/dev-team` updates this when a story completes).

## Current State

Monorepo foundation (US-001) and env config with fail-fast validation (US-002) and the API skeleton — request IDs, JSON logs, standard error format, Prisma client, health endpoint (US-003) — and the database baseline (US-004: schema conventions, `users` migration, real-Postgres test harness, demo seed) are in place. Local PostgreSQL 18 runs natively (no Docker yet); Redis deferred to Phase 5. GitHub Actions CI runs `pnpm check` against Postgres 18 (US-005). Telegram Login OIDC (US-006): `/login` → API start/callback → user + identity + minimal server session cookie; the web app proxies `/api/v1` to the API. Secure sessions (US-007): configurable absolute lifetime (`SESSION_TTL_DAYS`), `SessionGuard`, global Origin-check `CsrfGuard`, idempotent `POST /auth/logout`. Return to the original page (US-008): `returnTo` stored on the login attempt, shared `safeReturnTo` sanitizer, Instagram/TikTok "open in browser" notice on `/login`. Roles (US-009): `GET /auth/me`, `AdminGuard` / `ApprovedCreatorGuard`, `user_roles` + minimal `creator_profiles`, gated `/studio` and `/admin`, site header with user menu. Creator applications (US-010): shared slug rules + `RESERVED_SLUGS`, application columns + slug CHECKs on `creator_profiles`, `creators` module (`POST /creators/apply`, `GET /creators/me/application`), `/become-creator` page. Admin review (US-011): append-only `creator_application_reviews`, `admin` module (`GET /admin/creators/applications`, `POST /admin/creators/:id/approve|reject`), `/admin/creators` page, rejection reason shown on `/become-creator`. Creator profile editing (US-012): `avatar_key`/`banner_key` columns, private Cloudflare R2 storage seam (`OBJECT_STORAGE`, `R2ObjectStorage` via aws4fetch), raw `image/*` uploads checked by magic bytes, `GET`/`PATCH /creators/me`, `PUT /creators/me/avatar|banner`, public `GET /creators/:slug/images/:imageId`, `/studio/profile` page. Public creator page (US-013): public `GET /creators/:slug` (APPROVED + ACTIVE user, same 404 otherwise; also applied to public images), SSR `/{creatorSlug}` with avatar/banner, bio, category, empty Konten/Langganan sections, "Masuk" returning to the page. Draft posts (US-015): `posts` table (`post_visibility`, `post_status`, caption CHECK), `posts` module with owner-scoped `/creators/me/posts` (create/list/get/patch), `/studio/posts` list + `/new` + `/[postId]` edit pages. Post images (US-016): `STORAGE_DRIVER=local|r2` (local filesystem adapter + dev-only HMAC upload route, R2 presigned PUT), `media_assets` table, owner-scoped `/creators/me/posts/:postId/media` (upload slot → direct PUT → complete with size + magic-byte check, list, owner preview, delete), image section on the post edit page. Post video (US-017): `VIDEO_DRIVER=stub|stream` (`VideoProvider` seam: Cloudflare Stream direct creator upload with `requireSignedURLs`, or a dev stub on private object storage with simulated processing), `media_assets` VIDEO rows with `video_uid`/`duration_seconds` and a `PROCESSING` status refreshed by polling on complete/list, video cards + 5 s auto refresh on the post edit page; no playback until US-021. Premium post offers (US-018): append-only `post_offers` versions (current = highest), `PUT /creators/me/posts/:id/offer` under the post-row lock, "Harga & Akses" section on the post edit page. Publishing (US-019): `POST /creators/me/posts/:id/publish|hide` under the post-row lock (needs ≥ 1 READY media, no PROCESSING video, an offer for PREMIUM; `POST_MODERATION_REQUIRED` sends posts to PENDING_REVIEW), live posts (PUBLISHED/PENDING_REVIEW) only allow caption edits (`POST_LOCKED` for visibility/media changes), public `GET /creators/:slug/posts` feed (safe previews, no media references, uncached), Gratis/Premium sections on `/{creatorSlug}`, Publikasikan/Sembunyikan on the studio post page.

```
Influency/
├── CLAUDE.md  README.md  package.json  pnpm-workspace.yaml  pnpm-lock.yaml  .nvmrc  .env.example
├── apps/
│   ├── api/                   # @influency/api — NestJS 12 (ESM) on Fastify
│   │   ├── prisma.config.ts   # Prisma 7 config (root .env, DATABASE_URL)
│   │   ├── prisma/schema.prisma # conventions header + models (User, auth, roles, creator profiles)
│   │   ├── prisma/migrations/ # committed migrations (never edit applied ones)
│   │   ├── prisma/seed/       # demo seed: index.ts (entry), seed.ts (seedSteps), one file per step (fixed ids in src/common/demo-ids.ts)
│   │   ├── test/              # global-setup.ts (wipes + migrates TEST_DATABASE_URL once per run), prisma.ts (createTestPrisma), creator-profile.ts (profileFields),
│   │   │                      # fake-telegram.ts (createFakeTelegram: local JWKS + signIdToken + stub token endpoint), memory-storage.ts (createMemoryStorage)
│   │   └── src/
│   │       ├── main.ts        # loads root .env, validates env (exits 1 on error), JSON Nest logger, listens on API_PORT
│   │       ├── app.factory.ts # createApp() = createFastifyAdapter() (pino JSON logs, request IDs) + configureApp() (prefix api/v1, AllExceptionsFilter, @fastify/cookie, X-Request-Id header, `image/*` → Buffer parser capped at 5 MiB)
│   │       ├── app.module.ts  # imports CommonModule, HealthModule, AuthModule, CreatorsModule, PostsModule, AdminModule, DevStorageModule
│   │       ├── generated/     # Prisma client (gitignored, `prisma generate` on postinstall)
│   │       ├── modules/       # feature modules (backend.md): health/, auth/ (controller, service, telegram-oidc.client.ts), creators/ (applications; creator-profile.controller/service: profile edit + images), admin/ (creator application review), posts/ (studio posts under `/creators/me/posts` incl. publish/hide; post-media.controller/service: post images + video; public-posts.controller/service: public feed), dev-storage/ (local-driver upload route)
│   │       └── common/        # env.ts (envSchema, parseEnv, loadEnvFile, ENV token), common.module.ts (global ENV + PrismaService + OBJECT_STORAGE),
│   │                          # prisma.service.ts, domain-error.ts, all-exceptions.filter.ts, zod-validation.pipe.ts, crypto.ts (sha256hex),
│   │                          # session.guard.ts (SessionGuard → req.authSession), csrf.guard.ts (global APP_GUARD),
│   │                          # role.guards.ts (AdminGuard, ApprovedCreatorGuard → req.creatorProfileId),
│   │                          # object-storage.ts (ObjectStorage, OBJECT_STORAGE), r2-object-storage.ts (R2ObjectStorage), local-object-storage.ts (LocalObjectStorage), image-type.ts (detectImageType, detectVideoType), video-provider.ts (VideoProvider, VIDEO_PROVIDER), cloudflare-stream-video-provider.ts, stub-video-provider.ts
│   └── web/                   # @influency/web — Next.js 16 App Router, Tailwind 4, shadcn/ui
│       ├── AGENTS.md          # regenerated by `next dev`; points to bundled Next.js docs
│       └── src/
│           ├── app/           # layout.tsx (mounts SiteHeader), page.tsx, globals.css; (auth)/login/ (page, login-error-message, in-app-browser-notice);
│           │                  # studio/ + admin/ (layout = Suspense + StudioGate/AdminGate in *-gate.tsx, placeholder page); admin/creators/ (page, pending-applications.tsx, creator-application-actions.tsx); studio/profile/ (page, profile-editor.tsx, creator-profile-form.tsx, profile-image-input.tsx); studio/posts/ (page + my-post-list.tsx, new/, [postId]/ (+ post-media.tsx image/video upload, list, delete, processing refresh, `locked` while live; post-offer-form.tsx; post-status-actions.tsx publish/hide), post-form.tsx shared create/edit form, labels.ts status/visibility labels);
│           │                  # (subscriber)/become-creator/ (page, become-creator.tsx status view, creator-application-form.tsx); (public)/[creatorSlug]/ (page.tsx public creator page + LoginCta, creator-posts.tsx Gratis/Premium feed in Suspense, not-found.tsx)
│           ├── components/    # site-header.tsx (SiteHeader, UserMenu), logout-button.tsx, access-denied.tsx
│           ├── components/ui/ # shadcn components (button, input, textarea, label)
│           └── lib/           # utils.ts (cn), login-href.ts (loginHref, telegramStartHref),
│                              # api/ (origin.ts API_ORIGIN, current-user.ts getCurrentUser, creator-application.ts getMyCreatorApplication, admin-creator-applications.ts getPendingCreatorApplications, creator-profile.ts getMyCreatorProfile, public-creator.ts getPublicCreator (cookie-free, `use cache` minutes), studio-posts.ts getMyPosts/getMyPost/getMyPostMedia, public-posts.ts getPublicPosts (uncached, cookie-free))
├── packages/
│   ├── shared/                # @influency/shared — built with tsup to dist/ (ESM); types resolve to src/
│   └── config/                # @influency/config — tsconfig bases (base/library/nest/next), ESLint flat configs
├── .github/workflows/ci.yml  # CI: push to main + PRs → pnpm install --frozen-lockfile, pnpm check (postgres:18 service, placeholder env, SHA-pinned actions)
├── .claude/commands/          # /po, /tech-lead, /dev, /qa, /dev-team, /status
├── .agents/skills/            # /status mirrored as a skill for other agent tools
└── .agile/                    # handoff (.docs/), guidelines, backlog, plans, QA reports
```

**Patterns established:**
- ESM everywhere; relative imports in api/shared use `.js` suffixes.
- Tests: Vitest. API tests boot the real app via `createApp({ logger: false })` and use Fastify `app.inject()`. To override providers (e.g. `PrismaService`), build with `Test.createTestingModule(...).overrideProvider(...)`, then `createNestApplication(createFastifyAdapter({ logger: false }))` + `configureApp(app)`. Test-only controllers follow `common/errors.spec.ts`. `vitest.config.ts` sets a placeholder `DATABASE_URL` (never contacted). Web tests use Testing Library + jsdom.
- Errors: throw `DomainError(code, details?)`; codes/statuses/messages in `ERRORS` (`packages/shared/src/errors.ts`). Every error body is `{ error: { code, message, requestId, details } }`; unknown errors → 500 `INTERNAL_ERROR`. Validate input with `new ZodValidationPipe(schema)`.
- Request ID: `X-Request-Id` on every response (incoming reused if `/^[A-Za-z0-9_-]{1,64}$/`, else `req_<uuid>`); same value as `requestId` in pino logs and error bodies. Request logs record the path without query string.
- Database: inject `PrismaService` (global). Lazy connection — the API boots with the DB down. Schema conventions (uuidv7 UUID PKs, `Timestamptz(3)`, snake_case via `@map`, integer money) are enforced by `src/common/schema-conventions.integration.spec.ts`.
- Integration tests: `*.integration.spec.ts`, `createTestPrisma()` from `apps/api/test/prisma.ts`, against the shared `TEST_DATABASE_URL` DB (wiped + migrated once per `vitest run`; must end in `_test`). Specs that write rows use their own fixed ids or clean up. Specs run in parallel on one DB, so fixed ids must not collide: grep `0190a000-0000-7000-8000-0000001` for the ranges in use (`1a` creator-profile, `1b` public-profile, `1c` posts, `1d` post-media, `1e` post-media-video, `1f` post-offers, `20` post-publish, `21` public-posts, `22` creator-application-reviews-schema) and take the next one.
- Seed: add an idempotent step to `seedSteps` (`prisma/seed/seed.ts`), referencing fixed ids in `src/common/demo-ids.ts` (`DEMO_USER_IDS`, `DEMO_CREATOR_PROFILE_IDS`). `pnpm db:reset` / `db:seed` / `db:migrate` from the root.
- Post lifecycle (US-019): `POST_EDITABLE_STATUSES` (DRAFT, HIDDEN) / `isPostEditable` (shared). Anything that changes visibility or media takes the post-row lock (`lockPost` in `posts.service.ts`, `lockEditablePost` in `post-media.service.ts`) or a conditional write on status, so publish checks can't be bypassed. Public post data goes through `GET /creators/:slug/posts` only (counts + offer terms, never media refs).
- Env: one root `.env` (copy `.env.example`); real env vars win. Add new required variables to `envSchema` in `apps/api/src/common/env.ts` in the story that first uses them. `MIDTRANS_IS_PRODUCTION=true` is rejected.
- Auth: Telegram OIDC client behind the `TELEGRAM_OIDC_CLIENT` token (override with `createFakeTelegram().client()` in tests). Session cookie `SESSION_COOKIE` (`influency_session`, HttpOnly, SameSite=Lax, Secure on https `WEB_ORIGIN`); `sessions.token_hash` = `sha256hex(token)`. Sessions: absolute lifetime `SESSION_TTL_DAYS` (default 30) for row `expires_at` and cookie `Max-Age`. Protect endpoints with `@UseGuards(SessionGuard)` (exported by the global `CommonModule`): live row (not revoked, not expired by server time, user ACTIVE) or 401 `AUTH_REQUIRED`; read `req.authSession = { sessionId, userId }`. Test guarded behaviour with a test-only probe controller (see `common/session.guard.integration.spec.ts`).
- returnTo: always pass return paths through `safeReturnTo` (`@influency/shared`): same-origin relative, printable ASCII, ≤512 chars, not `/login*` or `/api*`, else `/`. The API stores it on `oidc_login_attempts.return_to` at start and redirects there from the callback (never from callback params). "Masuk" buttons link to `loginHref(currentPath)`.
- Roles: protect admin endpoints with `@UseGuards(AdminGuard)` and studio endpoints with `@UseGuards(ApprovedCreatorGuard)` (each includes the session check, so don't add `SessionGuard`); studio code reads `req.creatorProfileId`. Web: server components call `getCurrentUser()` (React `cache`, forwards only the session cookie) **inside `<Suspense>`** (cacheComponents); it returns `MeResponse | null`. Web gates are UX only.
- CSRF: global `CsrfGuard` rejects POST/PUT/PATCH/DELETE that carry the session cookie unless `Origin` === `WEB_ORIGIN` (403 `FORBIDDEN`); cookieless requests (webhooks) are not checked. Next server-side mutations must send `Origin: WEB_ORIGIN`.
- Web → API: `apps/web/next.config.ts` rewrites `/api/v1/*` to `API_ORIGIN` (`src/lib/api/origin.ts`: shell env, default `http://localhost:4000`); API redirects are relative so they resolve against the web origin.
- Validation issue paths from `ZodValidationPipe` are dotted strings (`details.issues[].path = 'slug'`); web forms map errors by that string.
- Creator slugs: validate with shared `slugSchema` (trim + lowercase, `SLUG_PATTERN`, not in `RESERVED_SLUGS`). Every new top-level web route must be added to `RESERVED_SLUGS`. DB CHECKs keep `creator_profiles.slug` lowercase + well-formed, so `UNIQUE(slug)` is case-insensitive. Specs creating `creator_profiles` rows spread `profileFields()` from `apps/api/test/creator-profile.ts`.
- Object storage: inject `@Inject(OBJECT_STORAGE) storage: ObjectStorage` (`put/get/head/delete/createUploadUrl`, server-generated `<prefix>/<uuid>` keys; storage stays private, R2 errors carry only the HTTP status; never log upload URLs). `STORAGE_DRIVER` picks the adapter: `local` (default; files under `LOCAL_STORAGE_DIR`, upload URLs hit dev-only `PUT /dev-storage/:prefix/:id` with an HMAC token; rejected in production) or `r2` (needs `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` + bucket CORS for browser PUT). Specs override it with `createMemoryStorage()` from `apps/api/test/memory-storage.ts` (`objects` map, `failNext.put|get|head|delete`, upload URL `memory://upload/<key>`; simulate the browser PUT with `objects.set`); `vitest.config.ts` sets `STORAGE_DRIVER=r2` with placeholders.
- Presigned uploads (post media, US-016): `POST …/media` validates the declared type/size and returns a slot (`UPLOAD_URL_TTL_SECONDS`), the browser PUTs directly to storage, `POST …/complete` checks `head` size first (never downloads oversized objects), then magic bytes, and copies the checked bytes to a new key (the upload URL can't be revoked); failures delete the object and mark the row REJECTED. Per-post limit enforced under a `SELECT … FOR UPDATE` on the post row.
- Video (US-017): inject `@Inject(VIDEO_PROVIDER) video: VideoProvider` (`createUpload/getStatus/delete`; states `pending_upload|processing|ready|error`). `VIDEO_DRIVER`: `stub` (default; `post-video/<uuid>` in `OBJECT_STORAGE` via presigned PUT, magic-byte check, `processing` ~5 s then `ready`; rejected in production) or `stream` (needs `CLOUDFLARE_STREAM_ACCOUNT_ID`, `CLOUDFLARE_STREAM_TOKEN`; browser POSTs multipart `file` to the one-time `uploadURL`). Video slots last `VIDEO_UPLOAD_TTL_SECONDS`, are created inside the post-row lock, and `PROCESSING` rows are re-checked on `complete` and `list` (provider errors logged, row unchanged). Specs override it with `createFakeVideoProvider()` from `apps/api/test/fake-video-provider.ts` (`set(uid, state)`, `deleted`, `failNext.getStatus|delete`); fixture video `apps/api/test/fixtures/sample.mp4`.
- Profile uploads: browser sends raw bytes with `content-type: image/*` (parsed to a Buffer, 5 MiB cap → 413 `FILE_TOO_LARGE`; unknown content type → 415 `UNSUPPORTED_FILE_TYPE`). Check type with `detectImageType` (magic bytes) and store the detected type, never the client header. Limits/types are shared TBD placeholders (`PROFILE_IMAGE_TYPES`, `PROFILE_IMAGE_MAX_BYTES`).
- ESLint configs are functions: `baseConfig(dir)`, `nestConfig(dir)`, `nextConfig(dir)`; each package's `eslint.config.mjs` passes `import.meta.dirname`.

## Roles & Authorization

Implemented (US-009, handoff §5.3). Roles are computed from the DB on every request, never stored on the session or taken from Telegram:

| Role | Source | Guard (API) | Error |
|------|--------|-------------|-------|
| `USER` | any live session of an ACTIVE user | `SessionGuard` | 401 `AUTH_REQUIRED` |
| `CREATOR` | derived: `creator_profiles.status = APPROVED` (never stored) | `ApprovedCreatorGuard` | 403 `CREATOR_NOT_APPROVED` |
| `ADMIN` | `user_roles` row (seed / manual DB only; no endpoint grants it) | `AdminGuard` | 403 `FORBIDDEN` |

Web `/studio` and `/admin` layouts redirect logged-out users to `/login?returnTo=/studio|/admin` and show `AccessDenied` for the wrong role. Seeded: Admin has ADMIN; Claudia (`claudiandreya`) and Creator B (`creatorb`) have APPROVED profiles.

## Apps & Packages

| Path | Purpose | Status |
|------|---------|--------|
| `apps/api` | `@influency/api` — NestJS REST API under `/api/v1` | health, errors, request IDs, Prisma (US-003); Telegram login (US-006); roles + `/auth/me` (US-009) |
| `apps/web` | `@influency/web` — Next.js web app | placeholder home (US-001), `/login` + `/api/v1` proxy (US-006), returnTo + in-app browser notice (US-008), header + studio/admin gates (US-009) |
| `packages/shared` | `@influency/shared` — `APP_NAME`, `API_PREFIX`, `ERRORS`/`ErrorCode`/`errorResponseSchema`, `LOGIN_ERROR_CODES`/`SESSION_COOKIE`, `safeReturnTo`/`RETURN_TO_MAX_LENGTH`, `ROLES`/`Role`/`meResponseSchema`/`MeResponse`, `RESERVED_SLUGS`/`SLUG_PATTERN`/`slugSchema`/`creatorApplicationSchema`/`creatorApplicationResponseSchema`/`CREATOR_AGREEMENT_VERSION`, `rejectCreatorApplicationSchema`/`adminCreatorApplicationSchema`/`adminCreatorApplicationListSchema`/`creatorReviewResultSchema`, `PROFILE_IMAGE_TYPES`/`PROFILE_IMAGE_MAX_BYTES`/`ProfileImageKind`/`updateCreatorProfileSchema`/`creatorProfileResponseSchema`, error codes `UNSUPPORTED_FILE_TYPE`/`FILE_TOO_LARGE`, `POST_CAPTION_MAX_LENGTH`/`POST_VISIBILITIES`/`POST_STATUSES`/`createPostSchema`/`updatePostSchema`/`studioPostSchema`/`studioPostListSchema`, `POST_IMAGE_TYPES`/`POST_IMAGE_MAX_BYTES`/`POST_MEDIA_MAX_PER_POST`/`MEDIA_KINDS`/`MEDIA_STATUSES`/`createMediaUploadSchema`/`studioMediaSchema`/`studioMediaListSchema`/`mediaUploadResponseSchema`, error codes `MEDIA_LIMIT_REACHED`/`MEDIA_UPLOAD_MISSING`, `POST_VIDEO_TYPES`/`POST_VIDEO_MAX_BYTES`/`POST_VIDEO_MAX_DURATION_SECONDS`/`mediaKindOf`, error code `VIDEO_PROCESSING_FAILED`, `POST_OFFER_MIN/MAX_PRICE_COINS`/`POST_OFFER_MIN/MAX_DURATION_DAYS`/`SECONDS_PER_DAY`/`setPostOfferSchema`/`postOfferSchema` (`StudioPost.offer`), error code `OFFER_REQUIRES_PREMIUM`, `POST_EDITABLE_STATUSES`/`isPostEditable`/`StudioPost.publishedAt`/`PUBLIC_FEED_LIMIT`/`publicPostSchema`/`publicPostListSchema`, error codes `POST_STATUS_CONFLICT`/`POST_LOCKED`/`MEDIA_REQUIRED`/`MEDIA_PROCESSING`/`OFFER_REQUIRED` | US-001, US-003, US-006, US-008, US-009, US-010, US-011, US-012, US-015, US-016, US-017, US-018, US-019 |
| `packages/config` | `@influency/config` — shared tsconfig + ESLint | done (US-001) |
| `apps/worker` | BullMQ worker | not started |

## API Modules

| Module | Responsibility | Status |
|--------|----------------|--------|
| `common` (global) | `ENV` (incl. `POST_MODERATION_REQUIRED`, US-019), `PrismaService`, `OBJECT_STORAGE` (local or R2 by `STORAGE_DRIVER`), `VIDEO_PROVIDER` (stub or Stream by `VIDEO_DRIVER`), `SessionGuard`, `AdminGuard`, `ApprovedCreatorGuard`, global `CsrfGuard` | US-003, US-007, US-009, US-012, US-016, US-017 |
| `health` | DB health check (Redis `disabled` until Phase 5) | US-003 |
| `creators` | Creator applications: apply (one per user, REJECTED may resubmit), read own application (+ latest rejection reason); approved creator edits own profile + avatar/banner; public profile (`GET :slug`) + profile images, visible only for APPROVED creators with an ACTIVE user (`PUBLIC_CREATOR`) | US-010, US-011, US-012, US-013 |
| `posts` | Studio posts: `ApprovedCreatorGuard` on the controller, every query filtered by `req.creatorProfileId` (foreign id = same 404 as unknown); create (always DRAFT), list (newest first, no pagination), get, patch caption (any status) / visibility (DRAFT/HIDDEN, or unchanged). Publish / hide (US-019): `publish` locks the post row, DRAFT/HIDDEN → PUBLISHED (or PENDING_REVIEW when `POST_MODERATION_REQUIRED`), keeps the first `published_at`; `hide` PUBLISHED/PENDING_REVIEW → HIDDEN. Post media (`PostMediaController`, US-016/017): upload slot, complete, list READY + PROCESSING, owner image preview, delete — slot/complete/delete only while the post is DRAFT/HIDDEN (`POST_LOCKED`). Offers (US-018): `setOffer` locks the post row, rejects FREE posts, appends `version + 1` unless terms are identical, any status; list/get include the current offer. Public feed (`PublicPostsController`, US-019): `GET /creators/:slug/posts` | US-015, US-016, US-017, US-018, US-019 |
| `dev-storage` | `PUT /dev-storage/:prefix/:id`: stand-in for a presigned PUT when `STORAGE_DRIVER=local` (HMAC token over key + content type + expiry); 404 with other drivers | US-016 |
| `admin` | `AdminGuard` on every controller. Creator application review: list pending, approve/reject (conditional update from PENDING_REVIEW + review row in one transaction) | US-011 |
| `auth` | Telegram OIDC (PKCE S256, state/nonce, browser-bound single-use attempts), find-or-create user by `(TELEGRAM, sub)`, session cookie; logout; returnTo; current user + roles | US-006, US-007, US-008, US-009 |

## Existing Entities (Prisma models)

| Model | Description |
|-------|-------------|
| `User` → `users` | Base account: `display_name`, `status` (`user_status`: ACTIVE/SUSPENDED). Seeded: 5 demo users (`DEMO_USER_IDS`) (US-004) |
| `AuthIdentity` → `auth_identities` | `provider` (`auth_provider`: TELEGRAM), `provider_sub`; UNIQUE `(provider, provider_sub)` (US-006) |
| `Session` → `sessions` | `token_hash` UNIQUE (SHA-256 hex), `expires_at` (now + `SESSION_TTL_DAYS`), `revoked_at` (set by logout) (US-006, US-007) |
| `OidcLoginAttempt` → `oidc_login_attempts` | `state` UNIQUE, `nonce`, `code_verifier`, `browser_binding_hash`, `expires_at` (10 min), `consumed_at` (single use), `return_to` (sanitized, default `/`) (US-006, US-008) |
| `UserRole` → `user_roles` | `role` (`granted_role`: ADMIN only); UNIQUE `(user_id, role)`. Seeded: Admin (US-009) |
| `CreatorProfile` → `creator_profiles` | One row per user (`user_id` UNIQUE): `slug` UNIQUE + CHECKs `slug = lower(slug)` and format (case-insensitive unique), `status` (`creator_profile_status`: PENDING_REVIEW/APPROVED/REJECTED), `display_name`, `bio`, `category`, `agreement_version` (placeholder), `agreement_accepted_at`, `avatar_key`/`banner_key` (nullable private R2 keys `profile-images/<uuid>`, new key per upload, US-012). Seeded: `claudiandreya`, `creatorb` APPROVED, `subscriberb` PENDING_REVIEW (create-only) (`DEMO_CREATOR_PROFILE_IDS`) (US-009, US-010, US-011) |
| `Post` → `posts` | `creator_profile_id` (FK RESTRICT), `visibility` (`post_visibility`: FREE/PREMIUM), `status` (`post_status`: DRAFT/PROCESSING/PENDING_REVIEW/PUBLISHED/HIDDEN/REMOVED, default DRAFT), `caption` (default `''`, CHECK ≤ 2000 = `POST_CAPTION_MAX_LENGTH` placeholder), `published_at` (first publish time, kept on re-publish; US-019); index `(creator_profile_id, created_at)` (US-015) |
| `MediaAsset` → `media_assets` | `post_id` (FK RESTRICT), `kind` (`media_kind`: IMAGE/VIDEO), `status` (`media_status`: PENDING_UPLOAD/PROCESSING/READY/REJECTED), `object_key` UNIQUE nullable (IMAGE: `post-media/<uuid>`, replaced by a fresh key on READY), `video_uid` UNIQUE nullable (VIDEO: provider id, never returned), `duration_seconds` (VIDEO, CHECK ≥ 0), CHECK `media_assets_storage_ref` (exactly one of key/uid by kind), `content_type` + `byte_size` (declared, then detected/actual on READY; CHECK `byte_size > 0`), `upload_expires_at`; index `(post_id, created_at)` (US-016, US-017) |
| `PostOffer` → `post_offers` | `post_id` (FK RESTRICT), `version` (UNIQUE `(post_id, version)`, CHECK ≥ 1), `price_coins` BIGINT (CHECK > 0), `duration_seconds` (CHECK > 0), `created_at`; append-only (no update/delete path), current offer = highest version; purchases will reference a row and snapshot its terms (US-018) |
| `CreatorApplicationReview` → `creator_application_reviews` | Append-only decision log: `creator_profile_id`, `reviewer_id`, `decision` (`creator_review_decision`: APPROVED/REJECTED), `reason` (CHECK: set exactly when REJECTED), `created_at`; FKs RESTRICT; no `updated_at` (US-011) |

## Existing API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/v1/health` | Public | 200 `ok` / 503 `degraded`; `checks.database` up/down, `checks.redis` disabled |
| GET | `/api/v1/auth/telegram/start?returnTo=` | Public | Creates a login attempt (stores sanitized `returnTo`), sets the `influency_oidc` binding cookie, 302 → oauth.telegram.org/auth |
| GET | `/api/v1/auth/telegram/callback` | Public | Code exchange + ID token check; 302 to the attempt's `returnTo` + `influency_session` cookie, or 302 `/login?error=login_cancelled` or `login_failed` (+ `&returnTo=…`) |
| GET | `/api/v1/auth/dev/login?user=&returnTo=` | Dev only (404 when `NODE_ENV=production`) | Session for a seeded demo user (`claudia`, `creatorB`, `subscriberA`, `subscriberB`, `admin`), then 302 to `returnTo`; linked from `/login` outside production builds |
| GET | `/api/v1/auth/me` | User (`SessionGuard`) | `{ id, displayName, roles }` (roles from DB, order USER, CREATOR, ADMIN), `cache-control: no-store` |
| POST | `/api/v1/auth/logout` | Public, idempotent (CSRF-checked when the cookie is sent) | Revokes the cookie's session, clears `influency_session`, 204 |
| POST | `/api/v1/creators/apply` | User (`SessionGuard`) | Creator application → 201 PENDING_REVIEW; 400 `VALIDATION_FAILED` (format/reserved slug, agreement), 409 `SLUG_TAKEN` / `CREATOR_APPLICATION_EXISTS`; REJECTED users may resubmit |
| GET | `/api/v1/creators/me/application` | User (`SessionGuard`) | `{ application: … | null }` (incl. `rejectionReason` while REJECTED), `cache-control: no-store` |
| GET | `/api/v1/creators/me` | Approved creator (`ApprovedCreatorGuard`) | Own `CreatorProfileResponse` (`slug, displayName, bio, category, avatarUrl, bannerUrl`), `no-store` |
| PATCH | `/api/v1/creators/me` | Approved creator | Any of `displayName`/`bio`/`category` (`''` clears); other fields stripped; 400 on empty/invalid |
| PUT | `/api/v1/creators/me/avatar` | `banner` | Approved creator | Raw JPEG/PNG/WebP bytes (magic-byte check); avatar ≤ 2 MiB, banner ≤ 5 MiB (placeholders) → 200 profile with new image URL; 415 `UNSUPPORTED_FILE_TYPE`, 413 `FILE_TOO_LARGE`; old object deleted best-effort |
| GET | `/api/v1/creators/:slug/images/:imageId` | Public | Current avatar/banner of an APPROVED creator with an ACTIVE user (US-013), streamed from R2; `immutable` cache, `nosniff`; else 404 |
| GET | `/api/v1/creators/:slug` | Public | `CreatorProfileResponse` of an APPROVED creator whose user is ACTIVE (slug case-insensitive), `cache-control: public, max-age=60`; unknown/pending/rejected/suspended → same 404 `NOT_FOUND` (US-013) |
| POST | `/api/v1/creators/me/posts` | Approved creator | `{ caption?, visibility }` → 201 `StudioPost` (`id, caption, visibility, status: DRAFT, createdAt, updatedAt`); `status` and unknown fields ignored (US-015) |
| GET | `/api/v1/creators/me/posts` | Approved creator | `{ posts: StudioPost[] }` own posts, newest first, `no-store` (US-015) |
| GET | `/api/v1/creators/me/posts/:id` | Approved creator | Own post, `no-store`; foreign/unknown → 404 `NOT_FOUND`, malformed id → 400 (US-015) |
| PATCH | `/api/v1/creators/me/posts/:id` | Approved creator | Any of `caption`/`visibility` → 200 `StudioPost`; `{}` → 400; foreign/unknown → 404 (US-015) |
| POST | `/api/v1/creators/me/posts/:id/publish` | Approved creator | DRAFT/HIDDEN → 200 `StudioPost` PUBLISHED (or PENDING_REVIEW with `POST_MODERATION_REQUIRED=true`); 409 `MEDIA_REQUIRED` (no READY media), `MEDIA_PROCESSING`, `OFFER_REQUIRED` (PREMIUM without offer), `POST_STATUS_CONFLICT`; foreign/unknown → 404 (US-019) |
| POST | `/api/v1/creators/me/posts/:id/hide` | Approved creator | PUBLISHED/PENDING_REVIEW → 200 `StudioPost` HIDDEN; other statuses 409 `POST_STATUS_CONFLICT` (US-019) |
| GET | `/api/v1/creators/:slug/posts` | Public | `{ posts: PublicPost[] }` PUBLISHED posts of a visible creator, newest `publishedAt` first, max 30 (`id, visibility, caption, publishedAt, imageCount, videoCount, offer` for PREMIUM); never media ids/keys/URLs; `no-store`; same 404 as the profile (US-019) |
| PUT | `/api/v1/creators/me/posts/:id/offer` | Approved creator | `{ priceCoins, durationDays }` (whole numbers, 1–10,000 Koin / 1–365 days placeholders) → 200 `StudioPost` with the current `offer`; new version only when terms change; 409 `OFFER_REQUIRES_PREMIUM` on FREE posts; foreign/unknown → 404 (US-018) |
| POST | `/api/v1/creators/me/posts/:postId/media` | Approved creator | `{ contentType, byteSize }` (JPEG/PNG/WebP ≤ 10 MiB, MP4/MOV/WebM ≤ 200 MiB placeholders) → 201 `{ media (PENDING_UPLOAD), upload: { url, method: PUT | POST, headers, formField?, expiresAt } }` (video: provider upload, `VIDEO_UPLOAD_TTL_SECONDS`), `no-store`; 409 `MEDIA_LIMIT_REACHED` (10/post placeholder); foreign/unknown post → 404 (US-016) |
| POST | `/api/v1/creators/me/posts/:postId/media/:mediaId/complete` | Approved creator | Checks the uploaded object: 413 `FILE_TOO_LARGE`, 415 `UNSUPPORTED_FILE_TYPE` (object deleted, REJECTED), 409 `MEDIA_UPLOAD_MISSING` (nothing uploaded / expired / rejected); video: 200 PROCESSING or READY, 422 `VIDEO_PROCESSING_FAILED` (REJECTED, provider video deleted); 200 `StudioMedia` READY (idempotent) (US-016, US-017) |
| GET | `/api/v1/creators/me/posts/:postId/media` | Approved creator | `{ media: StudioMedia[] }` READY + PROCESSING items, oldest first, `no-store`; re-checks PROCESSING videos with the provider first (US-016, US-017) |
| GET | `/api/v1/creators/me/posts/:postId/media/:mediaId/content` | Approved creator | Owner image preview bytes (detected type), `private, no-store`, `nosniff`; videos and others → 404 (US-016, US-017) |
| DELETE | `/api/v1/creators/me/posts/:postId/media/:mediaId` | Approved creator | 204, row deleted + object / provider video best-effort; 404 when foreign/unknown (US-016, US-017) |
| PUT | `/api/v1/dev-storage/:prefix/:id?exp=&sig=` | Upload token (local driver only) | Raw image or video (stub driver) bytes for a local-driver upload URL → 204; bad/expired token or other content type → 403; non-local driver → 404 (US-016) |
| GET | `/api/v1/admin/creators/applications` | Admin (`AdminGuard`) | `{ applications: [...] }` PENDING_REVIEW, oldest first (no pagination), `no-store` |
| POST | `/api/v1/admin/creators/:id/approve` | Admin | 200 `{ id, status: 'APPROVED' }`; 409 `CREATOR_APPLICATION_NOT_PENDING`, 404 `NOT_FOUND`, 400 bad uuid |
| POST | `/api/v1/admin/creators/:id/reject` | Admin | Body `{ reason }` (1–500, shown to applicant) → 200 `{ id, status: 'REJECTED' }`; same errors |

## Web Routes

| Route | Audience | Purpose |
|-------|----------|---------|
| `/` | Everyone | Placeholder home page (US-001) |
| `/login` | Visitor | "Masuk dengan Telegram" + friendly `?error=` messages (US-006); forwards `?returnTo=`, Instagram/TikTok "Buka di browser" notice with copy link (US-008) |
| `/studio` | Approved creator | Placeholder; logged out → `/login?returnTo=/studio`, otherwise "Profil kreator belum disetujui." (US-009); links "Edit profil" (US-012) and "Konten" (US-015) |
| `/studio/posts` | Approved creator | Own posts (caption first line or "Tanpa caption", Gratis/Premium · status label), "Buat post"; empty state "Belum ada post." (US-015) |
| `/studio/posts/new` | Approved creator | Caption + Gratis/Premium radio → creates draft, opens its edit page (US-015) |
| `/studio/posts/[postId]` | Approved creator | Status + Publikasikan (DRAFT/HIDDEN) / Sembunyikan (live) with API error messages (US-019); same form (PATCH, "Tersimpan."; Gratis/Premium disabled while live, caption-is-public hint); "Harga & Akses" section for Premium posts (price + days, "Versi n", PUT offer; US-018); "Media" section: image thumbnails + video cards (Memproses… / Siap · m:ss, auto refresh every 5 s while processing), upload (slot → PUT or multipart POST → complete, `n/10`), Hapus (US-016, US-017; upload + Hapus hidden while live, US-019); foreign/unknown/malformed id → "Post tidak ditemukan." (US-015) |
| `/studio/profile` | Approved creator | Read-only `influency.com/{slug}`, banner + avatar upload with preview, display name / bio / category form (US-012) |
| `/{creatorSlug}` | Everyone | Public creator page: banner/avatar (gradient/initials fallback), name, `influency.com/{slug}`, category, bio, "Konten" with Gratis / Premium preview cards (caption, "n foto · n video", date, lock + "n Koin · n hari" for premium; streamed uncached in Suspense, text only, US-019), empty "Langganan" section (US-026), "Masuk" → `/login?returnTo=/{slug}` when logged out; unknown/unapproved/suspended → "Kreator tidak ditemukan" (soft 404: 200 + noindex) (US-013) |
| `/admin` | Admin | Admin home with link to Pengajuan Kreator; logged out → `/login?returnTo=/admin`, otherwise "Anda tidak memiliki akses." (US-009, US-011) |
| `/admin/creators` | Admin | Pending creator applications with Setujui / Tolak (reason) actions (US-011) |
| `/become-creator` | User | Creator application form with `influency.com/{slug}` preview; pending notice / Studio link / prefilled resubmit (+ rejection reason) by status; logged out → `/login?returnTo=/become-creator` (US-010) |
| (all pages) | Everyone | Site header: name + Studio (creators) or "Jadi Kreator" (others) + Admin by role + "Keluar", or "Masuk" (US-009, US-010) |

## Background Jobs

| Job | Trigger | Status |
|-----|---------|--------|
| — | — | none yet |

## Current Feature Backlog

| Feature | Stories | Status |
|---------|---------|--------|
| project-foundation (Phase 1) | US-001–005 | US-001–005 ready_for_uat |
| telegram-auth (Phase 2) | US-006–009 | US-006–009 ready_for_uat |
| creator-onboarding (Phase 2) | US-010–012 | US-010–012 ready_for_uat |
| public-creator-page (Phase 2) | US-013–014 | US-013 ready_for_uat; US-014 backlog (moved after US-027: needs posts, offers, plans, entitlements) |
| creator-content (Phase 3) | US-015–019 | US-015–019 ready_for_uat |
| content-access (Phase 3) | US-020–021 | backlog |
| koin-wallet (Phase 4) | US-022–024 | backlog |
| content-purchases (Phase 4) | US-025–030 | backlog |
| midtrans-topup (Phase 5) | US-031–034 | backlog |
| telegram-notifications (Phase 5) | US-035–036 | backlog |
| creator-earnings (Phase 6) | US-037–039 | backlog |
| admin-operations (Phase 6) | US-040–043 | backlog |
| mvp-acceptance (Phase 6) | US-044–045 | backlog |
