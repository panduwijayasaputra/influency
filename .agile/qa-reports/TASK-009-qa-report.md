# QA Report: TASK-009 — PageHeader on existing pages, standalone headers and guidelines

**Status:** PASS
**Date:** 2026-11-07

## Code Review

### Guidelines Compliance
- [x] Creator profile: `PageHeader` with the display name as plain text; the profile `<h1>` is unchanged.
- [x] Post detail: `PageHeader "Postingan"` with `fallbackHref` to the creator replaces the inline back link; `ArrowLeft` import removed (`Link` still used by the login CTA). `py-6 pb-12` → `py-4`.
- [x] `/become-creator`: `PageHeader "Jadi Kreator"` (`asHeading`, fallback `/me`); the page's own `<h1>` is removed.
- [x] Studio and Admin layouts: `PageHeader "Studio"`/`"Admin"` with fallback `/`, placed before the gate's `Suspense`. Page `<h1>`s are unchanged.
- [x] `frontend.md` has an "App shell" section, and its reserved list includes `me`. `codebase-map.md` covers the shell components, `/me`, the reserved `me` and the backlog status; SiteHeader mentions are replaced. The `CLAUDE.md` reserved-route list now includes `me`.

### Security
- [x] No access, data or financial logic touched. Studio/admin gating is unchanged (the header is rendered outside the gate, and it carries only a static title).

### Code Quality
- [x] Known: `/studio/earnings` uses `ComingSoon`, so it shows the layout's "Studio" bar plus a "Penghasilan" bar. Both are sticky `top-0`, but the placeholder doesn't scroll, so they don't overlap in practice. Accepted for a placeholder; revisit when earnings is built.

## Acceptance Criteria Verification
- [x] Pages other than Home use the simple page header. The back button appears only after in-app navigation (or via an explicit fallback). A guest opening a bio link sees no back button.
- [x] The old Dark Social bottom nav and `SiteHeader` are replaced (grep clean in `apps/web/src`).

## Tests Run
- Post detail `page.test.tsx`: "Kembali" links to `/ana` on a direct visit; the "Postingan" title is shown.
- Creator page `page.test.tsx`: the banner contains the display name, the `h1` is still the name, and there is no "Kembali" on a direct visit.
- `become-creator.test.tsx` and the studio/admin gate tests pass unchanged.
- `pnpm check` green: shared 203, web 308, api 617 tests; format, lint and typecheck clean. `pnpm --filter @influency/web build` prerenders 22 routes.

## Notes
- The manual 320/375/390/430 px check was not done here (no browser in this session); it moves to UAT.
- Environment: `apps/api/node_modules` was missing `sharp` and `@fastify/rate-limit`, which made api lint fail. `corepack pnpm install` fixed it with no lockfile change.
