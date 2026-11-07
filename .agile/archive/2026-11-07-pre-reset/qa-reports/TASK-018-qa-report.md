# QA Report: TASK-018 — Web: API proxy and /login page

**Story:** US-006
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] `/login` under the `(auth)` route group; a server component with no `"use client"`
- [x] `searchParams` read inside a `<Suspense>` child (Next 16 `cacheComponents` rule), so the build reports `/login` as partial prerender (◐)
- [x] Message component in its own file (Next allows only page exports in `page.tsx`); codes come from shared `LOGIN_ERROR_CODES`
- [x] shadcn `Button asChild` + plain `<a>` (full navigation to the API redirect, not `<Link>`); mobile-first single column; copy in Bahasa Indonesia
- [x] The `/api/v1/:path*` rewrite reads `API_ORIGIN` server-side only (no `NEXT_PUBLIC_`), and the web process doesn't load the root `.env`, so API secrets stay out of the web app

### Security
- [x] Unknown or array `error` values render nothing; the value is never echoed (tested with `<script>`)
- [x] No tokens in the web app; session and binding cookies are HttpOnly and set by the API
- [x] Same-origin proxy keeps cookies first-party; no CORS opened

### Financial Integrity
- n/a

### Code Quality
- [x] Minimal; README documents the manual BotFather + tunnel setup

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Clicking "Login with Telegram" starts the OIDC + PKCE flow | PASS | Button → `/api/v1/auth/telegram/start`; via the proxy it returns 302 to `oauth.telegram.org/auth` with `code_challenge_method=S256` (curl, below) |
| 5 | A failed or cancelled login shows a friendly error and creates no session | PASS | `/login?error=login_cancelled|login_failed` messages (unit + SSR curl); callback failure through the proxy → `/login?error=login_failed`, no session cookie |

## Tests Run

- [x] `pnpm check` (format + lint + typecheck + test): PASS, shared 18, web 7, api 100
- [x] `pnpm --filter @influency/web build`: PASS (`/login` ◐ partial prerender)
- [x] New: `apps/web/src/app/(auth)/login/page.test.tsx` (button href; both messages; undefined, script and array values render nothing)
- [x] Manual proxy check (web :3100 → api :4100 with placeholder Telegram env; :3000 was occupied by another process):
  - `GET /api/v1/auth/telegram/start` → `302`, `location: https://oauth.telegram.org/auth?...code_challenge_method=S256`, `set-cookie: influency_oidc=…; Max-Age=600; Path=/api/v1/auth/telegram; HttpOnly; SameSite=Lax`, `cache-control: no-store`
  - `GET /api/v1/auth/telegram/callback?state=x&code=y` → `302 /login?error=login_failed`, binding cookie cleared, no session cookie
  - `GET /login?error=login_cancelled` SSR HTML contains the cancel message and the start link

## Issues

None.

## Notes

- **Not verified:** a login with a real Telegram bot through an HTTPS tunnel, including whether Telegram echoes `nonce` and sends `aud` as a string. This is the remaining UAT step (README "Telegram login (manual check)"). If the nonce isn't echoed, write `docs/ADR/0001-telegram-oidc-nonce.md` per the plan before relaxing the check.
