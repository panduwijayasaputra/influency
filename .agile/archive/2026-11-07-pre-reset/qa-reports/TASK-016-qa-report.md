# QA Report: TASK-016 — TelegramOidcClient (authorization URL, code exchange, ID token verification)

**Story:** US-006
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Plain class in `apps/api/src/modules/auth/telegram-oidc.client.ts`, no Prisma; ESM `.js` imports
- [x] External payloads (token response, ID token claims) validated with Zod after `jwtVerify`
- [x] Endpoints hardcoded from the current discovery document (matches the handoff's issuer)
- [x] The DI provider (`TELEGRAM_OIDC_CLIENT` factory) is wired in TASK-017 with `AuthModule`, the first place it is used

### Security
- [x] PKCE S256 only; `state` + `nonce` sent on every request
- [x] Code exchange server-side with Basic auth; client secret never in the authorization URL (tested)
- [x] `jwtVerify` pins issuer, audience = client ID, algorithms `RS256/ES256/EdDSA` (HS256 and `alg: none` rejected, tested), `maxTokenAge` 10m, 30s clock tolerance
- [x] Nonce required and compared; missing `sub` rejected
- [x] `OidcError.reason` contains only status codes / jose error codes, never token or response bodies; access token discarded
- [x] Token request has a 10s timeout; network failure → `OidcError`

### Financial Integrity
- n/a

### Code Quality
- [x] Small, single-purpose; fake provider in `apps/api/test/fake-telegram.ts` is reused by TASK-017 integration tests

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Auth Code + PKCE (S256) with state + nonce | PASS (client part) | `authorizationUrl` test; binding to the attempt is TASK-017 |
| 2 | Rejects invalid signature, wrong iss, wrong aud, expired, mismatched nonce | PASS | One test each; replayed state is TASK-017 |
| 4 | Client secret and ID token never sent to browser | PASS (client part) | Secret only in the Basic header to the token endpoint |

## Tests Run

- [x] `telegram-oidc.client.spec.ts`: 21 passed (RFC 7636 vector, URL params, Basic auth + form body, HTTP 400/500, missing id_token, unreachable, valid token, null name, wrong iss/aud, expired, stale iat, missing/mismatched nonce, missing sub, foreign key, HS256, alg none, garbage)
- [x] Typecheck / lint (api): PASS

## Issues

None.

## Notes

- Not verified against real Telegram: numeric `aud` and whether nonce is echoed back (plan Risks); confirm in the TASK-018 manual check.
