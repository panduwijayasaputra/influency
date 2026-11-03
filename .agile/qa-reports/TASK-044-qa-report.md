# QA Report: TASK-044 — Storage driver selection, presign/head on the storage seam, local dev adapter

**Story:** US-016
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Infrastructure in `common/` (`LocalObjectStorage`, `R2ObjectStorage`, `ObjectStorage` interface); dev upload route in its own `dev-storage` module
- [x] Env added to `envSchema` with fail-fast validation; messages list paths only (no values)
- [x] No new dependencies (aws4fetch query signing, Node `crypto`/`fs`)

### Security
- [x] `STORAGE_DRIVER=local` rejected when `NODE_ENV=production`; R2 vars required only for `r2`
- [x] Local keys must match `<prefix>/<uuid>` before any filesystem call (path traversal tested)
- [x] Dev upload route: 404 unless the injected storage is `LocalObjectStorage`; HMAC-SHA256 token over key + content type + expiry, `timingSafeEqual`, expiry checked against server time; per-process secret
- [x] Presigned R2 URL signs `content-type` (`X-Amz-SignedHeaders` includes it), secret not in URL; error messages carry the HTTP status only
- [x] CSRF guard still applies to the dev route when a cookie is sent (browser sends same-origin `Origin`)

### Creator / user isolation
- N/A in this task (keys are server-generated; ownership is enforced in TASK-046)

### Financial Integrity
- N/A

### Code Quality
- [x] Small adapters mirroring the existing R2 one; `shortcut:` comment updated for buffered `get`

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Short-lived, scoped upload URL | PASS (seam) | `createUploadUrl(key, contentType, ttl)` on R2 + local; owner check in TASK-046 |
| 2 | Allowed types/sizes by content | N/A here | `head` added so TASK-046 can size-check before downloading |
| 3 | Private storage, no permanent public URL | PASS | R2 bucket private; local files only reachable through API routes |
| 4 | Local dev adapter without cloud credentials | PASS | default `STORAGE_DRIVER=local`, no R2 vars needed |

## Tests Run

- [x] Full API suite: PASS (27 files, 291 tests). `me.integration.spec.ts` failed once in a parallel run and passed on two reruns (not touched by this task)
- [x] API typecheck + lint: PASS
- [x] New/updated: `local-object-storage.spec.ts` (10), `r2-object-storage.spec.ts` (put/get/delete/encoding/error + presign + head), `dev-storage.integration.spec.ts` (valid PUT, wrong type/sig/missing sig/other key, expired, non-local → 404), `env.spec.ts` (driver default, production+local, TTL bounds, unknown driver, R2 required for r2), `errors.spec.ts` (413 now at the raised `image/*` limit)

## Issues

None open. Fixed during dev: `r2-object-storage.spec.ts` (untracked, from US-012) was accidentally overwritten; its put/get/delete/key-encoding/error cases were rebuilt from the US-012 plan's test list.

## Notes

- `image/*` parser limit raised to 10 MiB (max of profile banner and post image limits); profile service still enforces its per-kind limits.
- R2 presign follows aws4fetch's `signQuery` + `allHeaders`; needs a manual check against a real bucket (CORS rule documented in README).
- Superrefine runs only when the base env parses, so R2 issues show after other env errors are fixed.
