# QA Report: TASK-073 — `GET /posts/:id/media-access` endpoint

**Story:** US-021
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] `MediaAccessController` + `MediaAccessService` in the existing `entitlements` module. The access decision comes only from `PostAccessService.check(postId, req.authSession?.userId ?? null)` and is never re-implemented
- [x] Shared contract: `mediaAccessResponseSchema` / `MediaAccessResponse` (`media`, `expiresAt`, `watermark`), new error code `RATE_LIMITED` (429)
- [x] `OptionalSessionGuard extends SessionGuard`: swallows only `AUTH_REQUIRED`, rethrows anything else
- [x] `@fastify/rate-limit@11.2.1`, pinned exactly and published 2026-10-08 (11.2.2 is 2 days old, so not used); no install scripts. Registered with `global: false`
- [x] Plan refinement: a reusable `RateLimitGuard` + `@RateLimit()` decorator calls the plugin's `createRateLimit()` from inside a Nest guard, instead of a route-level plugin hook. The 429 therefore goes through `AllExceptionsFilter` in the standard error format (with `requestId` and `Retry-After`), and logged-in users are keyed by **user id** (all sessions of one user share a budget; better than the planned cookie hash). One store per handler
- [x] `shortcut:` comments: in-memory store per process (→ Redis in Phase 5); `req.ip` is the proxy's IP until `trustProxy` is set
- [x] Spec uses the free id range `…00000025xxxx` (`24` was taken by US-048) and cleans up

### Security
- [x] URLs are minted only for `full`: `locked` → 403 `FORBIDDEN`, `hidden` / unknown → 404, malformed id → 400 (`ParseUUIDPipe`) before any DB access
- [x] Only READY media of that post (dedicated covers aren't media rows); a READY video the provider can't play is skipped
- [x] `cache-control: no-store`; a GET, so CSRF doesn't apply; the response is never cached or logged
- [x] Auth event log: `media_access post=… user=…|anon decision=… count=…`, with no URLs, tokens or cookies (asserted)
- [x] Watermark = `sha256(sessionId)[0..8]`, pseudonymous (no user id, name or Telegram data); null for anonymous viewers
- [x] Server time only; TTL from env; every refresh is a new request through the check (asserted with a REMOVED post)
- [x] Rate limit counts every request, including locked/hidden ones, so it can't be used to probe cheaply

### Financial Integrity
- N/A (read-only; US-050 adds purchase/subscription sources inside `PostAccessService`, with no change here)

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Short-lived URLs only after the access check | PASS | free/anonymous, owner draft |
| 2 | No access → `FORBIDDEN`, no URL | PASS | anonymous + stranger on premium |
| 3 | URLs expire after a configured time; fresh ones on request | PASS | `expiresAt` = now + `MEDIA_ACCESS_TTL_SECONDS` |
| 4 | Never in HTML/logs/analytics | PASS (API side) | log asserted; `no-store`; web side in TASK-074 |
| 5 | Video via signed token, each refresh re-checks | PASS | `createPlaybackUrl` per request; REMOVED → 404 |
| 7 | Rate-limited, auth events logged without tokens/URLs | PASS | 61st request → 429 `RATE_LIMITED`; other user/anonymous unaffected |
| 8 | Free posts use the same path | PASS | anonymous free → 200 |

## Tests Run

- [x] `media-access.integration.spec.ts`: 9 passed
- [x] `shared media-access.test.ts`: 2 passed
- [x] Full `pnpm check`: exit 0. Shared 176 (8 files), web 161 (27 files), api 487 (40 files)
- [x] Edge cases: expired/unknown cookie = anonymous; PENDING_UPLOAD media excluded; unplayable video skipped; re-check after removal; rate-limit isolation per user

## Issues

None.

## Notes

- `OptionalSessionGuard` has no dedicated probe spec; its three branches (live, expired, unknown cookie) are covered through the endpoint.
