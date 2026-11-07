# QA Report: TASK-027 — Web: `getCurrentUser`, `/studio` + `/admin` gates, site header

**Story:** US-009
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] Server components only. The only client component is the existing `LogoutButton`
- [x] The session read happens inside `<Suspense>` (gates and header `UserMenu`), as Next 16 `cacheComponents` requires (`authentication-with-cache-components.md`). `next build` succeeds; `/`, `/login`, `/studio`, `/admin` are partial-prerendered
- [x] Gates live in `studio-gate.tsx` / `admin-gate.tsx`, not in `layout.tsx`, because Next rejects non-standard layout exports
- [x] API access goes through `src/lib/api/` and validates the response with the shared `meResponseSchema`; one `API_ORIGIN` default (`src/lib/api/origin.ts`) is shared with `next.config.ts`
- [x] Shadcn `Button` + Tailwind, Bahasa copy (messages reuse `ERRORS.*.message`), mobile-first header (name truncated)

### Security
- [x] `getCurrentUser` forwards only `influency_session` to the API, uses `cache: 'no-store'`, and never puts the token in props/HTML
- [x] Web gates are UX only and say so in a comment. The API guards (TASK-026) are the boundary
- [x] Login redirect uses `loginHref` → `safeReturnTo` (fixed `/studio` / `/admin`)
- [x] An API outage makes the header show "Masuk" instead of crashing public pages. The gates let errors throw (an outage must not look like "logged out" there)

### Financial Integrity
- N/A

### Code Quality
- [x] Small, no duplication beyond the two parallel gate files; `shortcut:` comment for the section-root returnTo

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | `/auth/me` returns user/roles; `AUTH_REQUIRED` when logged out | PASS | Smoke: no cookie → 401 body; demo users → expected roles |
| 2 | USER for all; CREATOR only via approved profile; ADMIN only via DB/seed | PASS | Smoke: Subscriber A `['USER']`, Claudia `['USER','CREATOR']`, Admin `['USER','ADMIN']` |
| 3 | Studio pages blocked without an approved creator profile | PASS | Smoke: Subscriber A and Admin → "Profil kreator belum disetujui."; Claudia → Studio page |
| 4 | Admin pages return FORBIDDEN for non-admins | PASS | Smoke: Subscriber A and Claudia → "Anda tidak memiliki akses."; Admin → Admin page. HTTP status stays 200 because the gate runs after streaming starts (Next docs); the API returns a real 403 |
| 5 | Roles read from the DB per request | PASS | Web calls `/auth/me` per request (`no-store`, `cache()` dedupes within a request only) |

## Tests Run

- [x] `pnpm check` (format, lint, typecheck, all tests): PASS. shared 53, web 43, api 156
- [x] `pnpm --filter @influency/web build`: PASS
- [x] New tests: `src/lib/api/current-user.test.ts`, `src/app/studio/studio-gate.test.tsx`, `src/app/admin/admin-gate.test.tsx`, `src/components/site-header.test.tsx`
- [x] Edge cases: no cookie (no fetch), 401, 500, malformed body (unknown role), API down in the header, admin-without-profile on studio, creator on admin
- [x] Manual smoke (production build on :3100 + API with the seeded dev DB and temporary sessions, deleted afterwards): logged-out `/studio` → redirect to `/login?returnTo=%2Fstudio`; per-role gate results above; header shows name, Studio link and "Keluar" for Claudia and "Masuk" when logged out

## Issues

None in this task.

## Notes

- Environment, not code: the local `.env` currently has an invalid `TELEGRAM_OIDC_CLIENT_ID`, so `pnpm dev`'s API exits at startup. The smoke test overrode it with a placeholder env var.
- Port 3000 was taken by an older `next start` build (no `/studio`), so the smoke test used :3100.
- Logged-out redirect from `/studio` happens after streaming starts, so it is a client-side redirect (200 + redirect payload), not an HTTP 307. This is fine for UX.
