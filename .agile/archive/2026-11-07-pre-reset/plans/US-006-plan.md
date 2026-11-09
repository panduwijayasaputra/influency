# Technical Plan: US-006 — Log In with Telegram

## Architecture Overview

Telegram Login OIDC, Authorization Code + PKCE (S256), implemented in a new `auth` module in `apps/api`. Decisions agreed with the user (2026-11-03):

- **Session scope:** US-006 creates a minimal server session: a `sessions` row with a SHA-256 token hash and an HttpOnly cookie with a fixed 30-day lifetime. US-007 adds the configurable lifetime, rejection of expired sessions, logout, CSRF protection and `SessionGuard`. US-008 owns `returnTo`; US-009 owns `/auth/me` and roles.
- **Nonce:** sent on `/auth` and **required** to match the `nonce` claim (fail closed). Telegram's docs only mention nonce for their JS library. If a manual test with the real bot shows the claim is not echoed back, write `docs/ADR/0001-telegram-oidc-nonce.md` and relax the check to "single-use state + PKCE". Do not relax it without that ADR.
- **Same origin:** Next.js rewrites `/api/v1/:path*` to the API, so the browser only ever talks to `WEB_ORIGIN`. The registered callback is `${WEB_ORIGIN}/api/v1/auth/telegram/callback` (an HTTPS tunnel is needed for real Telegram). Cookies are first-party and no CORS is needed.
- **Fake provider in tests only:** the real `TelegramOidcClient` is built with injectable `fetch` + JWKS, so tests sign ID tokens with a local key pair. No dev fake-login.

Provider facts (verified against https://core.telegram.org/bots/telegram-login and the discovery doc on 2026-11-03). Hardcode these values; do not fetch discovery at runtime:

| | Value |
|---|---|
| issuer | `https://oauth.telegram.org` |
| authorization_endpoint | `https://oauth.telegram.org/auth` |
| token_endpoint | `https://oauth.telegram.org/token`, Basic auth `base64(client_id:client_secret)`, form body `grant_type=authorization_code, code, redirect_uri, client_id, code_verifier` |
| jwks_uri | `https://oauth.telegram.org/.well-known/jwks.json` |
| algs | RS256 default; BotFather can switch to ES256 / EdDSA |
| aud | Bot ID (= client ID) |
| claims used | `sub` (identity), `name` (display name, `profile` scope). No UserInfo endpoint. |
| scope requested | `openid profile` |

Differences from the handoff: none on the endpoints. The docs say PKCE is "recommended" and are silent on nonce in the manual flow and on whether `localhost` redirect URIs are accepted. Data minimization: store only `sub` and the display name. No username, picture or phone. US-035 can add the Telegram numeric id when bot DMs need it.

### Flow

```
Browser ── GET /login (web) ── click ──► GET /api/v1/auth/telegram/start
  API: create oidc_login_attempts row {state, nonce, codeVerifier, browserBindingHash, expiresAt=now+10m}
       Set-Cookie influency_oidc=<browserBinding> (HttpOnly, SameSite=Lax, Path=/api/v1/auth/telegram, Max-Age=600)
       302 → https://oauth.telegram.org/auth?client_id&redirect_uri&response_type=code&scope=openid profile&state&nonce&code_challenge&code_challenge_method=S256
Telegram ── 302 ──► GET /api/v1/auth/telegram/callback?code&state   (or ?error=access_denied&state)
  API: always clear influency_oidc
       consume attempt atomically (state matches, binding cookie hash matches, not consumed, not expired) → else fail
       if error param → fail(login_cancelled)
       exchange code (server-side, client secret) → id_token
       verify id_token (JWKS sig, iss, aud, exp, iat, nonce == attempt.nonce)
       find-or-create user by (TELEGRAM, sub) → create session → Set-Cookie influency_session
       302 → /
  any failure: 302 → /login?error=login_cancelled|login_failed, no session row, no session cookie
```

## Dependencies

- `jose` **6.2.13** (published 2026-10-20) in `apps/api`: JWKS + `jwtVerify`, also used to sign test tokens.
- `@fastify/cookie` in `apps/api`: reads/sets cookies (US-007 reuses it). Pick the newest version that supports Fastify 5 and was published at least two weeks ago (`npm view @fastify/cookie time`), and pin it exactly. Record both in `.agile/guidelines/tech-stack.md`.
- A BotFather bot with Login Widget configured and an HTTPS tunnel for the manual check only. CI and tests use none of these.

## Risks

- **Nonce not echoed by Telegram** → login fails closed in manual testing. Mitigation: the ADR path above.
- **`aud` sent as a JSON number** instead of a string would fail jose's audience check. Fail closed. If it happens in the manual test, compare `String(payload.aud)` explicitly and add a unit test.
- **The Next rewrite proxy must pass 302 + `Set-Cookie` through unchanged.** Verify manually with `curl -i http://localhost:3000/api/v1/auth/telegram/start`. If it doesn't, document the issue and stop. Don't fall back to cross-origin cookies.
- **First-login race** (two callbacks for the same new `sub`) → unique violation on `auth_identities`. Mitigation: catch Prisma `P2002` and re-read the identity.
- `oidc_login_attempts` rows accumulate. `shortcut:` no cleanup job; a delete-expired job can come with the worker in Phase 5.

## Tasks

### TASK-015: Auth schema, env config and dependencies

**Prisma models** (follow the conventions header in `schema.prisma`; uuidv7 ids, `Timestamptz(3)`, snake_case maps):

```prisma
enum AuthProvider {
  TELEGRAM
  @@map("auth_provider")
}

model AuthIdentity {
  id          String       @id @default(dbgenerated("uuidv7()")) @db.Uuid
  userId      String       @map("user_id") @db.Uuid
  provider    AuthProvider
  providerSub String       @map("provider_sub")
  createdAt   DateTime     @default(now()) @map("created_at") @db.Timestamptz(3)
  user        User         @relation(fields: [userId], references: [id], onDelete: Restrict)
  @@unique([provider, providerSub])
  @@index([userId])
  @@map("auth_identities")
}

model Session {
  id         String    @id @default(dbgenerated("uuidv7()")) @db.Uuid
  userId     String    @map("user_id") @db.Uuid
  tokenHash  String    @unique @map("token_hash")   // hex SHA-256 of the cookie token; raw token never stored
  expiresAt  DateTime  @map("expires_at") @db.Timestamptz(3)
  revokedAt  DateTime? @map("revoked_at") @db.Timestamptz(3)
  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  user       User      @relation(fields: [userId], references: [id], onDelete: Restrict)
  @@index([userId])
  @@map("sessions")
}

model OidcLoginAttempt {
  id                 String    @id @default(dbgenerated("uuidv7()")) @db.Uuid
  state              String    @unique
  nonce              String
  codeVerifier       String    @map("code_verifier")
  browserBindingHash String    @map("browser_binding_hash")  // hex SHA-256 of the influency_oidc cookie value
  expiresAt          DateTime  @map("expires_at") @db.Timestamptz(3)
  consumedAt         DateTime? @map("consumed_at") @db.Timestamptz(3)
  createdAt          DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  @@map("oidc_login_attempts")
}
```

Add `authIdentities AuthIdentity[]` and `sessions Session[]` to `User`. Create the migration with `pnpm db:migrate --name auth_identities_sessions` (never edit `20261102183928_init_users`). `schema-conventions.integration.spec.ts` must pass unchanged.

**Env** (`apps/api/src/common/env.ts` `envSchema`, all required):
- `WEB_ORIGIN: z.url()`: used for the `Secure` flag (https → Secure) and error redirects.
- `TELEGRAM_OIDC_CLIENT_ID: z.string().regex(/^\d+$/)`: Bot ID.
- `TELEGRAM_OIDC_CLIENT_SECRET: z.string().min(1)`.
- `TELEGRAM_OIDC_REDIRECT_URI: z.url()`.

Move these to the "Required now" block of `.env.example`, with `TELEGRAM_OIDC_REDIRECT_URI=http://localhost:3000/api/v1/auth/telegram/callback` and the comment "register in BotFather > Login Widget > Allowed URLs; real Telegram needs an HTTPS tunnel URL". Add test placeholders to the `env` block of `apps/api/vitest.config.ts` (`WEB_ORIGIN=http://localhost:3000`, `TELEGRAM_OIDC_CLIENT_ID=123456789`, `TELEGRAM_OIDC_CLIENT_SECRET=test-secret`, `TELEGRAM_OIDC_REDIRECT_URI=http://localhost:3000/api/v1/auth/telegram/callback`). That way CI and local tests never depend on `.env`, and `.github/workflows/ci.yml` needs no change. Extend `env.spec.ts` with cases for a missing client id and a non-numeric client id.

**Shared** (`packages/shared/src/auth.ts`, exported from `index.ts`):
```ts
export const LOGIN_ERROR_CODES = ['login_cancelled', 'login_failed'] as const;
export type LoginErrorCode = (typeof LOGIN_ERROR_CODES)[number];
export const SESSION_COOKIE = 'influency_session';
```

**Deps:** add `jose` 6.2.13 and `@fastify/cookie` (see Dependencies), pinned exactly. Update `pnpm-lock.yaml`, approve install scripts in `pnpm-workspace.yaml` `allowBuilds` only if one is needed, and update `tech-stack.md`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/prisma/schema.prisma` | AuthProvider, AuthIdentity, Session, OidcLoginAttempt |
| CREATE | `apps/api/prisma/migrations/<ts>_auth_identities_sessions/migration.sql` | generated migration |
| MODIFY | `apps/api/src/common/env.ts`, `env.spec.ts` | new required vars + tests |
| MODIFY | `apps/api/vitest.config.ts` | test placeholders |
| MODIFY | `.env.example` | required-now block, callback via web origin |
| CREATE | `packages/shared/src/auth.ts` | login error codes, cookie name |
| MODIFY | `packages/shared/src/index.ts` | export |
| MODIFY | `apps/api/package.json`, `pnpm-lock.yaml`, `.agile/guidelines/tech-stack.md` | deps |

**Testing:**
- The schema conventions spec passes with the new tables.
- Integration test: inserting two `auth_identities` with the same `(provider, provider_sub)` throws P2002.
- `env.spec.ts`: missing or invalid Telegram vars are listed in the error and their values never appear in it.

---

### TASK-016: TelegramOidcClient (authorization URL, code exchange, ID token verification)

`apps/api/src/modules/auth/telegram-oidc.client.ts`, a plain class with no Prisma:

```ts
export const TELEGRAM_ISSUER = 'https://oauth.telegram.org';
export interface TelegramOidcConfig { clientId: string; clientSecret: string; redirectUri: string }
export interface TelegramOidcDeps {
  fetch: typeof fetch;
  jwks: JWTVerifyGetKey;      // createRemoteJWKSet(new URL(`${TELEGRAM_ISSUER}/.well-known/jwks.json`)) in prod
  now?: () => Date;           // for exp/iat in tests
}
export interface VerifiedTelegramIdentity { sub: string; name: string | null }
export class OidcError extends Error { constructor(readonly reason: string) }  // reason is English, logged; never includes tokens

export class TelegramOidcClient {
  constructor(config: TelegramOidcConfig, deps: TelegramOidcDeps);
  authorizationUrl(p: { state: string; nonce: string; codeChallenge: string }): string;
  exchangeCode(p: { code: string; codeVerifier: string }): Promise<string>;   // returns id_token
  verifyIdToken(idToken: string, expectedNonce: string): Promise<VerifiedTelegramIdentity>;
}
export function pkceChallenge(verifier: string): string;  // base64url(sha256(verifier))
export function randomToken(): string;                    // base64url(randomBytes(32))
```

- `authorizationUrl`: `https://oauth.telegram.org/auth` + `URLSearchParams` with `client_id, redirect_uri, response_type=code, scope='openid profile', state, nonce, code_challenge, code_challenge_method=S256`.
- `exchangeCode`: POST `application/x-www-form-urlencoded` to the token endpoint with `Authorization: Basic base64(clientId:clientSecret)`. Use `AbortSignal.timeout(10_000)`. Non-2xx → `OidcError('token_exchange_failed: <status>')` without the body. Validate the response with Zod `{ id_token: z.string().min(1) }`. Discard the access token.
- `verifyIdToken`: `jwtVerify(idToken, jwks, { issuer: TELEGRAM_ISSUER, audience: clientId, algorithms: ['RS256','ES256','EdDSA'], maxTokenAge: '10m', clockTolerance: 30, currentDate: now?.() })`. Then Zod-parse the claims `{ sub: z.string().min(1), nonce: z.string(), name: z.string().optional() }`. Nonce mismatch, a missing nonce or a missing sub → `OidcError`. Wrap jose errors as `OidcError(err.code)`.
- `AuthModule` provides it under the token `TELEGRAM_OIDC_CLIENT`, using a factory that reads `ENV` and creates the remote JWKS once (jose caches keys).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/auth/telegram-oidc.client.ts` | client + helpers |
| CREATE | `apps/api/src/modules/auth/telegram-oidc.client.spec.ts` | unit tests |
| CREATE | `apps/api/test/fake-telegram.ts` | `createFakeTelegram()`: `generateKeyPair('RS256')`, `createLocalJWKSet`, `signIdToken(claims overrides, opts {key?, alg?})`, a stub `fetch` that records requests and returns `{ id_token }` (configurable status/token) |

**Testing** (unit, using `fake-telegram.ts`):
- `authorizationUrl` contains all the parameters, `code_challenge_method=S256`, and never the client secret.
- `pkceChallenge` matches the RFC 7636 appendix B vector (`dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` → `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM`).
- `exchangeCode` sends Basic auth + `code_verifier`, and a non-2xx response or a missing `id_token` → `OidcError`.
- `verifyIdToken` accepts a valid token. It rejects each of: a token signed by a different key (bad signature), wrong `iss`, wrong `aud`, expired `exp`, `iat` too old, missing nonce, mismatched nonce, missing `sub`, and `alg: none` / HS256.

---

### TASK-017: Auth module: start and callback endpoints, user and identity, session cookie

**Module:** `apps/api/src/modules/auth/` contains `auth.module.ts`, `auth.controller.ts` and `auth.service.ts`. Import it in `app.module.ts`. Register `@fastify/cookie` in `configureApp` (`app.register(fastifyCookie)`; make `configureApp` async if needed and update its callers in `createApp` and the tests that call it).

**Controller** (`@Controller('auth/telegram')`, thin):
- `GET start` → `service.startLogin()` → `{ redirectUrl, bindingToken }`. Set the cookie `influency_oidc=bindingToken` (`httpOnly, sameSite: 'lax', secure: WEB_ORIGIN starts with https, path: '/api/v1/auth/telegram', maxAge: 600`), then `302 redirectUrl`.
- `GET callback` → query parsed with Zod `{ code?: string, state?: string, error?: string }` (lenient: invalid input becomes a failed login, never a 400 JSON page) → `service.completeLogin({ ...query, bindingToken: req.cookies.influency_oidc })`.
  - Always clear `influency_oidc`.
  - Ok → set the cookie `SESSION_COOKIE=<sessionToken>` (`httpOnly, sameSite: 'lax', secure as above, path: '/', maxAge: 30 days`), then `302 /`.
  - Failure → `302 /login?error=<LoginErrorCode>`. Both redirects are relative so they resolve against the web origin through the proxy.
  - Add `Cache-Control: no-store` on both responses.

**Service:**
- `startLogin()`: state, nonce, codeVerifier and bindingToken = `randomToken()`. Insert `oidcLoginAttempt` with `browserBindingHash = sha256hex(bindingToken)` and `expiresAt = now + 10 min` (server time). Return `client.authorizationUrl({ state, nonce, codeChallenge: pkceChallenge(codeVerifier) })`.
- `completeLogin(input)` returns `{ ok: true, sessionToken } | { ok: false, code: LoginErrorCode }`. It never throws for expected failures and logs `reason` at `warn` without code, token or state values.
  1. If `state` or `bindingToken` is missing → `login_failed`.
  2. **Consume atomically:** `updateMany({ where: { state, browserBindingHash: sha256hex(bindingToken), consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } })`. If the count is not 1 → `login_failed`. This rejects unknown, replayed, expired and other-browser state. Then load the attempt by `state`.
  3. If the `error` param is present → `access_denied` maps to `login_cancelled`; anything else maps to `login_failed`.
  4. If `code` is missing → `login_failed`. Then `exchangeCode`, then `verifyIdToken(idToken, attempt.nonce)`. Any `OidcError` → `login_failed`.
  5. `findOrCreateUser(sub, name)`: `authIdentity.findUnique({ provider_providerSub })` returns the userId if found (the display name is not overwritten). Otherwise, in `$transaction`, create a `user { displayName: name?.trim() || 'Pengguna Telegram' }` and its `authIdentity`. On P2002 (concurrent first login), re-read the identity.
  6. `sessionToken = randomToken()`. Insert `session { userId, tokenHash: sha256hex(sessionToken), expiresAt: now + 30 days }`. `shortcut:` fixed 30-day lifetime; US-007 makes it configurable and enforces expiry.
- Put `sha256hex` in `apps/api/src/common/crypto.ts` (one line using `node:crypto`).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/api/src/modules/auth/auth.module.ts` | providers incl. `TELEGRAM_OIDC_CLIENT` factory |
| CREATE | `apps/api/src/modules/auth/auth.controller.ts` | start / callback |
| CREATE | `apps/api/src/modules/auth/auth.service.ts` | attempt, login, user, session |
| CREATE | `apps/api/src/common/crypto.ts` | `sha256hex` |
| MODIFY | `apps/api/src/app.module.ts` | import AuthModule |
| MODIFY | `apps/api/src/app.factory.ts` | register `@fastify/cookie` |
| CREATE | `apps/api/src/modules/auth/auth.integration.spec.ts` | real Postgres + fake Telegram |

**Testing** (integration: `Test.createTestingModule({ imports: [AppModule] }).overrideProvider(TELEGRAM_OIDC_CLIENT).useValue(new TelegramOidcClient(cfg, fake deps))` + `createNestApplication(createFastifyAdapter({ logger: false }))` + `configureApp`; drive with `app.inject`. Use a unique `sub` per test so the shared DB stays clean.)
- `start` → 302 to `oauth.telegram.org/auth` with S256 challenge + state + nonce. It sets an `influency_oidc` HttpOnly cookie and creates one attempt row whose `codeVerifier` is not in the URL.
- Happy path (start → callback with the cookie + state; the fake signs a token with the attempt's nonce) → 302 `/`. `Set-Cookie influency_session` has `HttpOnly; SameSite=Lax; Path=/`. One user, one identity and one session row exist, and the session's `tokenHash` is the hash of the cookie value, not the value itself.
- Returning user (same `sub`, second login) → same user id, no new user, two sessions.
- Same `name`, different `sub` → two distinct users (identity is never matched by name or username).
- Each of these → 302 `/login?error=login_failed` with no new session and no `influency_session` cookie: bad signature, wrong iss, wrong aud, expired token, nonce mismatch, replayed state (second callback with the same state + cookie), unknown state, missing or wrong binding cookie, expired attempt (set `expiresAt` in the past), token endpoint 500.
- `?error=access_denied&state=…` → `/login?error=login_cancelled`, no session.
- No response body, `Location` or `Set-Cookie` contains the client secret or the id_token (assert on the raw response strings).
- Concurrent first login: two attempts for the same new `sub`, completed with `Promise.all` → one user and one identity.

---

### TASK-018: Web: API proxy and /login page

- `apps/web/next.config.ts`: `async rewrites() { return [{ source: '/api/v1/:path*', destination: \`${process.env.API_ORIGIN ?? 'http://localhost:4000'}/api/v1/:path*\` }] }`. Add `API_ORIGIN` to the web env notes in `.env.example` (it is already listed). Server-side only, so no `NEXT_PUBLIC_` prefix.
- `apps/web/src/app/(auth)/login/page.tsx` (server component; read the Next 16 docs in `node_modules/next/dist/docs/` for async `searchParams` with `cacheComponents`):
  - Heading "Masuk ke Influency" and a short line saying a Telegram account is used.
  - Primary `Button` rendered as a plain `<a href="/api/v1/auth/telegram/start">` (full navigation, not `<Link>`, because the response is a cross-site redirect) with the label "Masuk dengan Telegram".
  - When `searchParams.error` is in `LOGIN_ERROR_CODES`, show `role="alert"` text. `login_cancelled` → "Login dibatalkan. Silakan coba lagi bila ingin masuk." `login_failed` → "Login gagal. Silakan coba lagi." Ignore unknown values (never echo them).
  - Mobile-first at ~375px.
- README: add a "Telegram login (manual)" section covering the BotFather Login Widget Allowed URLs (origin + `${WEB_ORIGIN}/api/v1/auth/telegram/callback`), the HTTPS tunnel requirement (set `WEB_ORIGIN` and `TELEGRAM_OIDC_REDIRECT_URI` to the tunnel URL), and the `curl -i …/api/v1/auth/telegram/start` proxy check from Risks.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/web/next.config.ts` | `/api/v1` rewrite to API |
| CREATE | `apps/web/src/app/(auth)/login/page.tsx` | login page |
| CREATE | `apps/web/src/app/(auth)/login/page.test.tsx` | component tests |
| MODIFY | `README.md` | manual Telegram login setup |

**Testing** (Vitest + Testing Library, following `app/page.test.tsx`):
- The button links to `/api/v1/auth/telegram/start`.
- `error=login_cancelled` and `error=login_failed` each show their message in `role="alert"`.
- No `error`, or an unknown value such as `<script>`, shows no alert and doesn't render the value.
- Manual check, recorded in the QA report: with the dev servers running, `curl -i http://localhost:3000/api/v1/auth/telegram/start` returns 302 to oauth.telegram.org with `Set-Cookie: influency_oidc`. A real-bot login through a tunnel ends on `/` with the `influency_session` cookie set, and nonce behaviour is confirmed (otherwise write the ADR).
