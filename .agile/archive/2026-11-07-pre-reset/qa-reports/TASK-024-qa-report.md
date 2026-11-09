# QA Report: TASK-024 — Web: forward returnTo on /login, `loginHref` helper, in-app browser notice

**Story:** US-008
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] `/login` stays a server component. The start button is in a Suspense'd async component that reads `searchParams.returnTo`; its fallback is the same button with the plain start URL, so the button is never missing
- [x] Only `InAppBrowserNotice` is a client component (needs `navigator` + clipboard). It uses the existing shadcn `Button`, Bahasa Indonesia copy, and a mobile-first stacked layout
- [x] `loginHref` / `telegramStartHref` in `src/lib/login-href.ts` reuse the shared `safeReturnTo`; the API stays authoritative

**Plan deviations (intentional):**
- The returnTo forwarding is tested through `telegramStartHref` (`lib/login-href.test.ts`) instead of rendering the page: Testing Library can't render async server components. The existing page test still covers the fallback button href.
- UA detection uses `useSyncExternalStore` (server snapshot `false`) instead of `useEffect` + state. Same hydration safety, and no `set-state-in-effect` lint suppression.

### Security
- [x] Unsafe `returnTo` values never reach a rendered href (`https://evil.com`, arrays, `/login` → plain start URL)
- [x] The copied link is `window.location.href` of `/login` itself (same origin); no user input is rendered as HTML

### Accessibility
- [x] Notice has an `h2` heading; the copy result is announced via a `role="status"` live region; the manual-copy input has `aria-label`

## Acceptance Criteria Verification

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Login from a creator page/post returns to it | PASS | `/login?returnTo=/kreator/posts/abc` → start href carries it; API redirects to it (TASK-023). `loginHref()` is ready for US-013/014 buttons |
| 2 | Same-origin relative paths only | PASS | Web drops unsafe values; API re-checks |
| 3 | "Open in browser" option in Instagram/TikTok in-app browser | PASS | Notice with ⋯ → "Buka di browser" steps + "Salin tautan"; manual-copy fallback when the clipboard fails |

## Tests Run

- [x] `pnpm check`: PASS (shared 50, web 27, api 139)
- [x] New: `lib/login-href.test.ts`, `(auth)/login/in-app-browser-notice.test.tsx` (real Instagram iOS / TikTok Android UAs vs desktop Chrome / iOS Safari / Android Chrome; copy success; copy rejected → read-only input)
- [ ] Manual (left for UAT): Chrome devtools UA override on `/login?returnTo=/x`, and a real-device Instagram/TikTok login through the tunnel

## Issues

None.
