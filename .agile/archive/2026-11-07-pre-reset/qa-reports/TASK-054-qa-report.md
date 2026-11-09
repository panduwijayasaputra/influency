# QA Report: TASK-054 — Publish / hide API and live-post edit locks

**Story:** US-019
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Logic in `PostsService` / `PostMediaService`; controller stays thin (`POST :id/publish`, `POST :id/hide`, `@HttpCode(200)`)
- [x] New codes in shared `ERRORS` with Bahasa messages; `DomainError` everywhere
- [x] `POST_MODERATION_REQUIRED` added to `envSchema` (string-enum style like `MIDTRANS_IS_PRODUCTION`) + `.env.example` placeholder
- [x] No migration needed (`status` / `published_at` exist since US-015)

### Security
- [x] No new input besides the uuid param (validated by `postIdPipe`)
- [x] Raw SQL uses tagged-template parameters only
- [x] `ApprovedCreatorGuard` on the controller; CSRF guard covers the new POSTs (tested)
- [x] Creator isolation: every lock/update is scoped by `creator_profile_id`; another creator's post → 404 (tested for publish and hide)

### Financial Integrity
- N/A (no money movement). The premium-needs-offer check runs under the post-row lock.

### Code Quality
- [x] `lockPost` helper reused by `setOffer` and `publish`; `lockEditablePost` shared by media `createUpload` / `remove`
- [x] Conditional single writes for `update` (visibility lock) and `hide`; NOT_FOUND is distinguished from the conflict by a follow-up owner-scoped read

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Publish → PUBLISHED (or PENDING_REVIEW if configured) | PASS | Both paths tested; moderated app built with an `ENV` override |
| 2 | Premium cannot publish without an offer | PASS | 409 `OFFER_REQUIRED`, status stays DRAFT; publishes after an offer exists. Visibility locked while live |
| 3 | Appear on creator page | n/a here | TASK-055/057 |
| 4 | Creator can hide a published post | PASS | PUBLISHED/PENDING_REVIEW → HIDDEN; draft/hidden/removed → 409 `POST_STATUS_CONFLICT` |

## Tests Run

- [x] `pnpm check`: PASS (shared 164, web 133, api 384)
- [x] Typecheck / lint / format: PASS
- [x] New tests: `apps/api/src/modules/posts/post-publish.integration.spec.ts` (14), `isPostEditable` in `posts.test.ts`, `POST_MODERATION_REQUIRED` in `env.spec.ts`
- [x] Edge cases: no media / only PENDING_UPLOAD / only REJECTED → `MEDIA_REQUIRED`; PROCESSING video → `MEDIA_PROCESSING`; re-publish keeps `publishedAt`; REMOVED can't be published or hidden; live post: caption PATCH ok, same-visibility PATCH ok, visibility change / media slot / media delete → `POST_LOCKED`; late `complete` → `POST_LOCKED`, READY `complete` idempotent; publish ∥ delete race never leaves a published post without READY media; 401/403/404/400/CSRF

## Issues (if any)

None blocking.

## Notes

- Fixed an unrelated, already-present flaky fixed-id collision: `creator-application-reviews-schema.integration.spec.ts` and `me.integration.spec.ts` both used the `…0000000d` range (seen as a `users_pkey` failure once). Moved the schema spec to `…00000022`.
- With moderation on, `publishedAt` is the submission time. An admin approve story may want to set it on approval instead.
- Documented shortcut: `complete` reads the post status without a lock (the race can only add media to the creator's own live post).
