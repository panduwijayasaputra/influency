# QA Report: TASK-071 — Signed download URLs for object storage

**Story:** US-021
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Extends the existing `ObjectStorage` seam (`createDownloadUrl` + `DownloadUrl`), mirrors `createUploadUrl` in both adapters and the memory fake
- [x] Dev GET route reuses the upload route's driver check and the owner-preview response headers (`private, no-store`, `nosniff`, `inline`)
- [x] `shortcut:` comment for the missing Range support (dev only)

### Security
- [x] R2: query-signed GET with `X-Amz-Expires`, no secret in the URL, no network call
- [x] Local: HMAC over key + a `\ndownload` marker + expiry, so upload and download tokens can't be swapped (a header value can't contain a newline). Tested in both directions, including over HTTP
- [x] Key validated (`KEY_PATTERN`) before any filesystem access; tampered, missing and expired signatures → 403; non-local driver → 404
- [x] URLs are never logged (request logs drop the query string)

### Financial Integrity
- N/A

### Code Quality
- [x] Minimal diff; `verifyDownloadToken` reuses the upload verification

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 3 | Media URLs expire after a short configured time | PASS (seam) | Expiry built into both URL kinds; TTL is wired by TASK-073 |
| 4 | Signed URLs never in logs | PASS | No logging of URLs added |

## Tests Run

- [x] `vitest run` r2-object-storage, local-object-storage, dev-storage: 30 passed (3 files)
- [x] `tsc --noEmit` (api): PASS
- [x] ESLint + Prettier on the touched files: PASS
- [ ] Full `pnpm check`: not run cleanly. A parallel session (US-048) has uncommitted work in the same tree, and its `preview-generator.spec.ts` currently has 2 lint errors that aren't part of this task
- [x] New tests: GET presign (R2); download token issue/verify/expiry/non-interchangeability (local); dev GET route 200 + headers, 403 cases, download-URL-as-upload 403, missing 404, other driver 404

## Issues

None.
