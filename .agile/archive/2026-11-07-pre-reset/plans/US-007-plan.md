# Technical Plan: US-007 — Secure Session & Logout

## Architecture Overview

US-006 already sets an `influency_session` cookie (HttpOnly, SameSite=Lax, Secure when `WEB_ORIGIN` is https) and stores only `sha256hex(token)` in `sessions`. It uses a hardcoded 30-day `SESSION_TTL_MS` marked `shortcut:`. US-007 completes the session lifecycle. Decisions agreed with the user (2026-11-03):

- **Lifetime:** `SESSION_TTL_DAYS` env (int, default 30) sets the row's `expires_at` and the cookie's `Max-Age`. Expiry is **absolute** (no sliding, no write per request). After expiry the user logs in again with Telegram.
- **`SessionGuard`** (`apps/api/src/common/`). It accepts a request only when a `sessions` row matches the cookie's hash, has `revoked_at IS NULL` and `expires_at > now` (API server time), and belongs to a user with `status = ACTIVE`. Otherwise it returns 401 `AUTH_REQUIRED`. On success it sets `req.authSession = { sessionId, userId }`. US-009 (`/auth/me`, roles) builds on it.
- **Logout:** `POST /api/v1/auth/logout` sets `revoked_at`, clears the cookie and returns 204. It is **idempotent**: a missing, unknown, expired or already-revoked cookie still gets a 204 and a cleared cookie. This deviates on purpose from the handoff §11.1 "Auth: User" so that logout never fails for the user.
- **CSRF: Origin check.** A global `CsrfGuard` (`APP_GUARD`) covers every unsafe method (anything except GET/HEAD/OPTIONS) whose request **carries the session cookie**. Such a request must have `Origin` exactly equal to the origin of `WEB_ORIGIN`, otherwise it gets 403 `FORBIDDEN`. A missing `Origin` or `Origin: null` is rejected (fail closed). Requests without the session cookie, such as future Midtrans and Telegram webhooks, can't act as a user, so the check skips them. Together with SameSite=Lax this covers handoff §12.1. There is no token plumbing in the web app. Rule for later stories: any Next **server-side** mutation that forwards the session cookie must also send `Origin: WEB_ORIGIN`.
- **Web:** a `LogoutButton` client component with tests. It is **not mounted** anywhere yet. US-009 places it in the logged-in header once `/auth/me` exists.

## Dependencies

- None new. Reuses `@fastify/cookie` (US-006), `PrismaService`, `sha256hex`, `DomainError`.

## Risks

- **Next rewrite proxy and the `Origin` header.** The CSRF check relies on the proxy forwarding `Origin` unchanged. Verify manually (TASK-020). If it is stripped or rewritten, stop and report. Don't weaken the check.
- **Server-side mutations from Next** (server actions or route handlers calling the API with the forwarded cookie) carry no browser `Origin` and would get 403. None exist yet. The rule is documented in `backend.md` and `frontend.md`.
- **Expired and revoked `sessions` rows accumulate.** `shortcut:` no cleanup job. A delete-expired job can come with the worker in Phase 5, alongside `oidc_login_attempts` cleanup.
- **Sessions created by US-006 keep their old 30-day `expires_at`.** That's fine, because the guard reads `expires_at` from the row.

## Tasks

### TASK-019: Configurable session lifetime, SessionGuard and CSRF guard

**Env** (`apps/api/src/common/env.ts` `envSchema`):
```ts
// Absolute session lifetime; a new Telegram login is needed after it.
SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
```
Add `SESSION_TTL_DAYS=30` to `.env.example` next to `SESSION_SECRET`, with the comment `# absolute session lifetime in days (default 30)`. Leave `SESSION_SECRET` as is. Nothing reads it yet.

**AuthService / AuthController** (`apps/api/src/modules/auth/`):
- Delete `SESSION_TTL_MS` and its `shortcut:` comment from `auth.service.ts`. Inject `@Inject(ENV) env: Env` into `AuthService` and set `expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 86_400_000)`.
- In `auth.controller.ts`, set the session cookie `maxAge: env.SESSION_TTL_DAYS * 86_400` (seconds). Drop the `SESSION_TTL_MS` import.

**SessionGuard** (`apps/api/src/common/session.guard.ts`):
```ts
export interface AuthSession { sessionId: string; userId: string }
declare module 'fastify' {
  interface FastifyRequest { authSession?: AuthSession }
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const token = req.cookies[SESSION_COOKIE];
    if (!token) throw new DomainError('AUTH_REQUIRED');
    const session = await this.prisma.session.findFirst({
      where: {
        tokenHash: sha256hex(token),
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { status: 'ACTIVE' },
      },
      select: { id: true, userId: true },
    });
    if (!session) throw new DomainError('AUTH_REQUIRED');
    req.authSession = { sessionId: session.id, userId: session.userId };
    return true;
  }
}
```
Don't log the token or its hash. Use the `UserStatus` enum from the generated client if the codebase already imports enums that way, otherwise the string literal. Name the property `authSession`, not `session`, to avoid clashing with `@fastify/session` typings. Export the guard from `CommonModule` (`providers` + `exports`). Usage: `@UseGuards(SessionGuard)`.

**CsrfGuard** (`apps/api/src/common/csrf.guard.ts`), registered globally in `CommonModule` as `{ provide: APP_GUARD, useClass: CsrfGuard }`:
```ts
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** CSRF: a cookie-authenticated mutation must come from the web origin (handoff §12.1). */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly webOrigin: string;
  constructor(@Inject(ENV) env: Env) {
    this.webOrigin = new URL(env.WEB_ORIGIN).origin; // normalizes trailing slash / default port
  }
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (SAFE_METHODS.has(req.method)) return true;
    // No session cookie → the request can't act as anyone (e.g. provider webhooks).
    if (!req.cookies[SESSION_COOKIE]) return true;
    if (req.headers.origin === this.webOrigin) return true;
    throw new DomainError('FORBIDDEN');
  }
}
```
The error body goes through `AllExceptionsFilter` (standard `{ error: { code: 'FORBIDDEN', … } }`). Add no new error code.

**Guidelines:**
- `.agile/guidelines/backend.md` "Auth and authorization": add "CSRF: global `CsrfGuard` rejects POST/PUT/PATCH/DELETE carrying the session cookie unless `Origin` equals `WEB_ORIGIN` (403 `FORBIDDEN`); requests without the cookie (webhooks) are not checked. Sessions have an absolute lifetime (`SESSION_TTL_DAYS`); `SessionGuard` sets `req.authSession`."
- `.agile/guidelines/frontend.md` "Auth": add "Mutations go from the browser to same-origin `/api/v1` (the browser sends `Origin`). A Next server-side call that mutates with the forwarded session cookie must also send `Origin: WEB_ORIGIN`, or the API returns 403."

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/common/env.ts`, `env.spec.ts` | `SESSION_TTL_DAYS` + tests |
| MODIFY | `.env.example` | `SESSION_TTL_DAYS=30` |
| CREATE | `apps/api/src/common/session.guard.ts` | `SessionGuard`, `AuthSession`, Fastify request augmentation |
| CREATE | `apps/api/src/common/csrf.guard.ts` | `CsrfGuard` |
| MODIFY | `apps/api/src/common/common.module.ts` | export `SessionGuard`; `APP_GUARD` → `CsrfGuard` |
| MODIFY | `apps/api/src/modules/auth/auth.service.ts`, `auth.controller.ts` | TTL from env |
| CREATE | `apps/api/src/common/session.guard.integration.spec.ts` | guard + CSRF tests |
| MODIFY | `apps/api/src/modules/auth/auth.integration.spec.ts` | TTL + Secure cookie assertions |
| MODIFY | `.agile/guidelines/backend.md`, `.agile/guidelines/frontend.md` | rules above |

**Testing:**
- `env.spec.ts`: an unset `SESSION_TTL_DAYS` defaults to 30. `'7'` parses to 7. `0`, `-1`, `1.5` and `abc` are rejected and listed in the error.
- `session.guard.integration.spec.ts` (real Postgres via `createTestPrisma()`). Build it like `errors.spec.ts`: `Test.createTestingModule({ imports: [CommonModule], controllers: [ProbeController] })` + `createFastifyAdapter({ logger: false })` + `configureApp`. `ProbeController` (`@Controller('test-session')`) has `@Get('me') @UseGuards(SessionGuard)` returning `req.authSession`, `@Post('mutate') @HttpCode(200)` (no session guard) returning `{ ok: true }`, and `@Get('read')` returning `{ ok: true }`. Insert fixture users and sessions directly, using fixed uuids that don't collide with `DEMO_USER_IDS` and `tokenHash = sha256hex(token)`, and clean up in `afterAll`.
  - SessionGuard: no cookie → 401 `AUTH_REQUIRED`. Unknown token → 401. Valid session → 200 with `{ sessionId, userId }`. `expiresAt` in the past → 401. `revokedAt` set → 401. User `SUSPENDED` → 401. The response never echoes the token.
  - CsrfGuard: POST `mutate` with the session cookie and `Origin: http://localhost:3000` → 200. With the cookie and no `Origin` → 403 `FORBIDDEN`. With the cookie and `Origin: https://evil.example` → 403. With the cookie and `Origin: null` → 403. Without the cookie and without `Origin` → 200 (exempt). GET `read` with the cookie and an evil `Origin` → 200 (safe method).
- `auth.integration.spec.ts`: after a successful login, the session row's `expiresAt` ≈ `now + 30 days` (±1 min) and the cookie's `Max-Age` = `2592000`. Add a test whose module overrides `ENV` with `{ ...parseEnv(process.env), WEB_ORIGIN: 'https://influency.test', SESSION_TTL_DAYS: 7 }`. Its session cookie has `Secure`, `Max-Age=604800`, and `expiresAt` ≈ now + 7 days.

---

### TASK-020: POST /auth/logout (server-side revocation)

**Controller** (`apps/api/src/modules/auth/auth.controller.ts`): change `@Controller('auth/telegram')` to `@Controller('auth')` and the routes to `@Get('telegram/start')` and `@Get('telegram/callback')`. The paths stay the same. Add:
```ts
/** Idempotent: always 204 and a cleared cookie; revokes the session if the cookie names a live one. */
@Post('logout')
@HttpCode(204)
async logout(@Req() req: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
  await this.auth.logout(req.cookies[SESSION_COOKIE]);
  void reply
    .header('cache-control', 'no-store')
    .clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure: this.secure })
    .status(204)
    .send();
}
```
Pull the shared session-cookie attributes (`httpOnly, sameSite: 'lax', secure, path: '/'`) into one private field used by both `setCookie` and `clearCookie`, so they can't drift. `CsrfGuard` already covers this route (POST + cookie). No `SessionGuard`, because logout is idempotent.

**Service** (`auth.service.ts`):
```ts
/** Revokes the session for this cookie token, if any. Never throws for unknown/expired/revoked tokens. */
async logout(token: string | undefined): Promise<void> {
  if (!token) return;
  await this.prisma.session.updateMany({
    where: { tokenHash: sha256hex(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
```
It only touches the current session, never the user's other sessions. `revokedAt: null` in the `where` keeps the first revocation time on a repeat logout.

**Manual check** (record in the QA report): with `pnpm dev` running, log in, then run `curl -i -X POST -H "Origin: http://localhost:3000" --cookie "influency_session=<value>" http://localhost:3000/api/v1/auth/logout` → 204 + a cleared cookie. The same request without `-H Origin` → 403. This confirms the Next proxy forwards `Origin`. If it doesn't, stop and report (see Risks).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/src/modules/auth/auth.controller.ts` | `auth` prefix, `POST logout`, shared cookie options |
| MODIFY | `apps/api/src/modules/auth/auth.service.ts` | `logout(token)` |
| CREATE | `apps/api/src/modules/auth/logout.integration.spec.ts` | lifecycle tests |

**Testing** (`logout.integration.spec.ts`, real Postgres + fake Telegram. Set it up like `auth.integration.spec.ts` (reuse its login helper; move it into `apps/api/test/` if that avoids copying it) plus a test-only `ProbeController` with `@Get('me') @UseGuards(SessionGuard)` added to the testing module's `controllers`):
- Full lifecycle: log in (start → callback) to get the cookie → `GET probe/me` 200 → `POST /api/v1/auth/logout` with the cookie + `Origin: http://localhost:3000` → 204, `Set-Cookie` clears `influency_session` (empty value, `Max-Age=0` or a past `Expires`, `Path=/`), and the row has `revokedAt` set → the old cookie on `GET probe/me` → 401 `AUTH_REQUIRED`.
- Logout only revokes the current session: log in twice as the same `sub`, log out with cookie A, and cookie B still gets 200 on `probe/me`.
- Logout without a cookie and without `Origin` → 204 + a cleared cookie (idempotent, CSRF-exempt).
- Logout with an unknown token or an already-revoked token → 204, and the existing `revokedAt` is unchanged.
- Logout with a valid cookie but no `Origin`, or a foreign `Origin` → 403 `FORBIDDEN`, and the session still works on `probe/me`.
- `GET /api/v1/auth/logout` → 404 (POST only).

---

### TASK-021: Web LogoutButton component (not mounted yet)

`apps/web/src/components/logout-button.tsx`, a client component (`'use client'`):
- Renders the shadcn `Button` (`variant="ghost"` or the house default) with the label "Keluar".
- On click: set pending (button disabled, label "Keluar…"), then `fetch('/api/v1/auth/logout', { method: 'POST' })`. It's same-origin, so the browser sends the cookie and `Origin`. If `res.ok`, call `window.location.assign('/')`, a full navigation so no server-rendered logged-in state survives. Otherwise, or if fetch throws, clear pending and show `role="alert"` with "Gagal keluar. Silakan coba lagi."
- No token handling in JS (the cookie is HttpOnly).
- Don't mount it in any page. US-009 adds it to the logged-in header. Note that in a one-line comment at the top of the file.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/components/logout-button.tsx` | component |
| CREATE | `apps/web/src/components/logout-button.test.tsx` | tests |

**Testing** (Vitest + Testing Library, following `app/(auth)/login/page.test.tsx`; mock `fetch` with `vi.stubGlobal` and `window.location.assign` with `vi.spyOn`, or stub `location` if jsdom blocks the spy):
- Clicking calls `fetch('/api/v1/auth/logout', { method: 'POST' })` once, and on 204 navigates to `/`.
- While pending, the button is disabled (a double click sends only one request).
- A 403 or 500 response, or a fetch rejection, shows the alert text and doesn't navigate. The button is enabled again.
