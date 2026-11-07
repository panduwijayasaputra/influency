# Technical Plan: US-008 — Return to Original Page After Login

## Architecture Overview

Agreed with the user on 2026-11-03:

- **One sanitizer, shared.** `safeReturnTo(value: unknown): string` in `@influency/shared`. The API check is the authoritative one. The web app runs the same function so it never builds a bad link. Anything that isn't a plain same-origin relative path becomes `/`.
- **The return path is stored on the server.** `GET /auth/telegram/start?returnTo=…` saves the cleaned path on the `oidc_login_attempts` row. The callback reads it from the attempt it just consumed, so nothing coming back from Telegram can change it. Success → `302 <returnTo>`. Failure after the attempt was consumed → `302 /login?error=…&returnTo=…`, so a retry still comes back to the same page. A failure before consume (unknown state) → `/login?error=…` with no returnTo, because we have no trusted value.
- **Web.** `/login?returnTo=…` forwards the cleaned path to the start link. `loginHref(returnTo)` in `apps/web/src/lib/` builds `/login?returnTo=…` for the "Masuk" buttons that US-013/014 will add to creator and post pages. Those pages don't exist yet, so the tests use arbitrary paths such as `/somecreator/posts/abc`.
- **In-app browser** (user's choice: copy link + steps, login page only). A client component on `/login` detects Instagram/TikTok from `navigator.userAgent`. It shows a notice with instructions ("⋯ → Buka di browser") and a "Salin tautan" button that copies the current `/login?returnTo=…` URL, so login in the external browser still returns to the right page. There is no `intent://` or other platform trick, and no banner on other pages.

### returnTo rules (`safeReturnTo`)

Return the input unchanged only if all of these hold. Otherwise return `/`:
1. `typeof value === 'string'`, length 1–512.
2. Starts with `/`, and the second char is not `/` or `\` (blocks `//evil.com` and `/\evil.com`).
3. No `\` anywhere and no control chars (`/[\u0000-\u001F\u007F]/`). Browsers treat `\` as `/` and strip tab/newline, so these could turn into a protocol-relative URL.
4. `new URL(value, 'http://x.invalid')` has origin `http://x.invalid`, as a final check.
5. The pathname is not `/login` (or `/login/…`) and not `/api` (or `/api/…`), to avoid login loops and redirects into raw API responses.

Return the original string (with query and hash) rather than re-serializing it. It is already proven safe, and this keeps the creator's query params as they were.

## Dependencies

- None new. Uses existing Prisma, Zod, Next and Testing Library.

## Risks

- **Open redirect through encoding tricks** (`/%2F%2Fevil.com`, `/\t/evil.com`, `/\evil.com`). Mitigation: rules 2–4 plus explicit unit vectors. `%2F` stays percent-encoded inside the path, so it is a same-origin path and safe.
- **Hydration mismatch** if the UA is checked during render. Mitigation: detect it in `useEffect`, so the server and first client render show nothing.
- **Clipboard API unavailable** in some webviews. Mitigation: on failure, show the URL in a read-only `<input>` that is selected so the user can copy it by hand.
- UA detection is heuristic. `shortcut:` Instagram/TikTok UA substrings only. Add more apps (Facebook `FBAN`/`FBAV`, LINE) when real-device testing shows they break login.

## Tasks

### TASK-022: Shared `safeReturnTo` sanitizer

Create `packages/shared/src/return-to.ts` and export it from `packages/shared/src/index.ts` (`export * from './return-to.js';`):

```ts
/** Max length of a stored return path; longer values fall back to `/`. */
export const RETURN_TO_MAX_LENGTH = 512;

/**
 * Same-origin relative path or `/`. Used by the API (authoritative) and the web app.
 * Never returns an absolute or protocol-relative URL (no open redirect).
 */
export function safeReturnTo(value: unknown): string;
```

Implement the rules in "returnTo rules" above. Wrap `new URL` in try/catch, so a throw returns `/`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `packages/shared/src/return-to.ts` | sanitizer |
| CREATE | `packages/shared/src/return-to.test.ts` | unit tests (follow `constants.test.ts`) |
| MODIFY | `packages/shared/src/index.ts` | export |

**Testing** (`it.each` tables):
- Kept unchanged: `/`, `/kreator`, `/kreator/posts/abc`, `/kreator?tab=posts#top`, `/kreator/%2F%2Fx`, `/wallet`.
- → `/`: `undefined`, `null`, `123`, `['/a']`, `''`, `'kreator'`, `'//evil.com'`, `'/\\evil.com'`, `'/a\\b'`, `'https://evil.com'`, `'javascript:alert(1)'`, `'/\t/evil.com'`, `'/\n/evil.com'`, `'/\u0000x'`, `'/login'`, `'/login?returnTo=/x'`, `'/login/'`, `'/api/v1/auth/telegram/start'`, `'/api'`, a path of 513 chars.
- `/loginx` and `/apiary` are kept (prefix check is segment-based, not `startsWith('/login')`).

---

### TASK-023: API: store returnTo on the login attempt and redirect to it

**Schema:** add to `OidcLoginAttempt` in `apps/api/prisma/schema.prisma`:
```prisma
  returnTo           String    @default("/") @map("return_to")  // safeReturnTo() output; never raw input
```
Create the migration with `pnpm db:migrate --name oidc_attempt_return_to`. Never edit existing migrations. Run `pnpm --filter @influency/api generate`. `schema-conventions.integration.spec.ts` must still pass.

**Controller** (`apps/api/src/modules/auth/auth.controller.ts`):
- `start`: add `@Query() query: unknown`. Parse leniently with `z.object({ returnTo: z.string().optional().catch(undefined) }).catch({})`, then call `this.auth.startLogin(safeReturnTo(parsed.returnTo))`. A bad value never produces a 400; it becomes `/`.
- `callback`: on success, `.redirect(result.returnTo, 302)` instead of `'/'`. On failure, build the location with a helper:
  ```ts
  function loginErrorLocation(code: LoginErrorCode, returnTo?: string): string {
    const params = new URLSearchParams({ error: code });
    if (returnTo && returnTo !== '/') params.set('returnTo', returnTo);
    return `/login?${params.toString()}`;
  }
  ```
  Update the doc comments (`Ends on returnTo …`).

**Service** (`apps/api/src/modules/auth/auth.service.ts`):
- `startLogin(returnTo: string)` stores `returnTo` on the attempt row. The caller has already sanitized it. Defense in depth: store `safeReturnTo(returnTo)`, which costs nothing.
- `LoginResult` becomes `{ ok: true; sessionToken: string; returnTo: string } | { ok: false; code: LoginErrorCode; returnTo?: string }`.
- `completeLogin`: failures before the atomic consume (missing state/binding, `count !== 1`) return no `returnTo`. After `findUniqueOrThrow`, every `fail(...)` carries `attempt.returnTo`, and success returns `attempt.returnTo`. Change `fail` to accept an optional `returnTo`.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `apps/api/prisma/schema.prisma` | `OidcLoginAttempt.returnTo` |
| CREATE | `apps/api/prisma/migrations/<ts>_oidc_attempt_return_to/migration.sql` | generated migration |
| MODIFY | `apps/api/src/modules/auth/auth.controller.ts` | parse returnTo on start; redirect on callback |
| MODIFY | `apps/api/src/modules/auth/auth.service.ts` | store and return returnTo |
| MODIFY | `apps/api/src/modules/auth/auth.integration.spec.ts` | new cases (reuse its start → callback helpers) |

**Testing** (integration, extend the existing spec and its fake-Telegram setup):
- `start?returnTo=/kreator/posts/abc` → the attempt row has `returnTo = '/kreator/posts/abc'`, and the Telegram redirect URL does **not** contain it.
- `start` without returnTo → row `returnTo = '/'`; the happy path still ends with `302 /` (the existing test keeps passing).
- Happy path with `returnTo=/kreator/posts/abc?x=1` → `302` `Location: /kreator/posts/abc?x=1` plus the session cookie.
- `start?returnTo=` each of `https://evil.com`, `//evil.com`, `/\evil.com`, `/login` → the row has `'/'`, and the callback redirects to `/`. `Location` never contains `evil.com`.
- `start?returnTo=a&returnTo=b` (array) → `/`, not 400.
- `?error=access_denied` on an attempt with `returnTo=/kreator` → `Location: /login?error=login_cancelled&returnTo=%2Fkreator`.
- Token-exchange failure on an attempt with returnTo → `/login?error=login_failed&returnTo=…`.
- Unknown state → `Location` is exactly `/login?error=login_failed` (no returnTo).

---

### TASK-024: Web: forward returnTo on /login, `loginHref` helper, in-app browser notice

**`apps/web/src/lib/login-href.ts`:**
```ts
import { safeReturnTo } from '@influency/shared';
/** `/login`, carrying the page to return to after login (for "Masuk" buttons on creator/post pages). */
export function loginHref(returnTo: string): string; // '/' → '/login'; else `/login?returnTo=${encodeURIComponent(safe)}`
```

**`apps/web/src/app/(auth)/login/page.tsx`:**
- The start button is currently static. The start href now depends on `searchParams.returnTo`, so move the `<a>` into an async component inside the existing `<Suspense>` (same pattern as `LoginError`). It renders `TELEGRAM_START` when `safeReturnTo(returnTo)` is `/`, otherwise `${TELEGRAM_START}?returnTo=${encodeURIComponent(safe)}`. Use the Suspense fallback = the same button pointing to plain `TELEGRAM_START`, so the button is never missing. Check the Next 16 docs in `node_modules/next/dist/docs/` for `searchParams` + Suspense under `cacheComponents`.
- Render `<InAppBrowserNotice />` above the heading block.

**`apps/web/src/app/(auth)/login/in-app-browser-notice.tsx`** (`'use client'`):
```ts
// shortcut: Instagram/TikTok UA substrings only; add FBAN/FBAV/Line when real devices show login breaking there.
export const IN_APP_BROWSER_UA = /Instagram|musical_ly|BytedanceWebview|TikTok/i;
export function isInAppBrowser(userAgent: string): boolean;
export function InAppBrowserNotice(): JSX.Element | null;
```
- `useEffect` sets `inApp` from `navigator.userAgent`. It renders `null` until then, which avoids a hydration mismatch.
- When `inApp`: a bordered notice (not `role="alert"`, because it is informational) with:
  - Title: "Buka di browser agar login lancar"
  - Body: "Login dengan Telegram mungkin tidak berhasil di browser Instagram atau TikTok. Ketuk menu ⋯ lalu pilih \"Buka di browser\", atau salin tautan ini dan buka di Chrome/Safari."
  - `Button variant="outline"` "Salin tautan" → `navigator.clipboard.writeText(window.location.href)`. On success the label becomes "Tautan disalin" and the confirmation sits in a `role="status"` live region. On a reject or missing clipboard, show a read-only `<input aria-label="Tautan halaman ini" value={href}>` and select it on focus.
- Mobile-first at ~375px. Use existing `Button` and `cn` only.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/lib/login-href.ts` | `loginHref` |
| CREATE | `apps/web/src/lib/login-href.test.ts` | unit tests |
| MODIFY | `apps/web/src/app/(auth)/login/page.tsx` | forward returnTo, mount notice |
| CREATE | `apps/web/src/app/(auth)/login/in-app-browser-notice.tsx` | detection + copy link |
| CREATE | `apps/web/src/app/(auth)/login/in-app-browser-notice.test.tsx` | component tests |
| MODIFY | `apps/web/src/app/(auth)/login/page.test.tsx` | returnTo forwarding cases |

**Testing** (Vitest + Testing Library):
- `loginHref('/')` → `/login`. `loginHref('/kreator/posts/abc')` → `/login?returnTo=%2Fkreator%2Fposts%2Fabc`. `loginHref('//evil.com')` → `/login`.
- Login page: `returnTo=/kreator/posts/abc` → button href `/api/v1/auth/telegram/start?returnTo=%2Fkreator%2Fposts%2Fabc`. `returnTo=https://evil.com` and no returnTo → the href is exactly `/api/v1/auth/telegram/start`. The existing error-message tests stay green.
- `isInAppBrowser`: true for real sample UAs (Instagram iOS `… Instagram 300.0.0 …`, TikTok Android `… musical_ly_2023… BytedanceWebview/d8a21c6`). False for desktop Chrome, iOS Safari, Android Chrome.
- `InAppBrowserNotice`: renders nothing with a Chrome UA. With an Instagram UA (stub `navigator.userAgent` via `vi.spyOn(navigator, 'userAgent', 'get')`) it shows the title and the "Salin tautan" button. Clicking it calls a mocked `navigator.clipboard.writeText` with `window.location.href` and shows "Tautan disalin". When `writeText` rejects, the read-only input shows the URL.
- Manual check (QA report): open `/login?returnTo=/x` in Chrome devtools with an Instagram UA override → the notice appears, and copy works. A real-bot login (tunnel) started from `/login?returnTo=/somecreator` ends on `/somecreator` (a 404 is fine until US-013).
