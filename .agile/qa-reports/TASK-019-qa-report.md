# QA Report: TASK-019 — Guest view of the creator page (no header, actions to login)

**Status:** PASS
**Date:** 2026-11-07

## Code Review

### Guidelines Compliance
- [x] `CreatorPage` keeps the cached `getPublicCreator` fetch and `generateMetadata`, so link previews are unchanged. The viewer-dependent markup streams in one `Suspense` as `CreatorView` (still server-rendered in the same response). The build still lists `/[creatorSlug]` as a partial prerender.
- [x] Guest view:
  - no `PageHeader`
  - **Masuk**, **Bagikan** (a link styled like the share button via the exported `SHARE_BUTTON_CLASS`) and **Masuk untuk berlangganan** all link to `loginHref('/{slug}')`
  - premium tiles link to the post page instead of opening the purchase sheet
- [x] Signed-in view is unchanged (header, native share, subscribe sheet, premium sheet).
- [x] `LoginCta` is folded into the view (one session read, React-`cache`d with the layout's).

### Security
- [x] All guest actions resolve to same-origin `/login?returnTo=%2F{slug}`, and the post page's own guest actions were already login links.
- [x] An API outage renders the guest view (tested).

### Code Quality
- [x] The Instagram/TikTok dummy chips stay disabled, and the content filter chips stay as view-only controls.

## Acceptance Criteria Verification
- [x] Guests can open the creator page and its posts with no top bar and no bottom nav.
- [x] Every guest action on the creator page goes to `/login` with `returnTo`. Opening a post is allowed.

## Tests Run
- Creator `page.test.tsx`:
  - `CreatorView` for a guest and for an outage: no banner; h1; Masuk, Bagikan and Masuk untuk berlangganan → `/login?returnTo=%2Fclaudiandreya`; no share button; Konten shown.
  - Signed in: header, no Masuk, "Bagikan halaman" button, Langganan sheet button.
  - `CreatorPage` renders nothing until the session check. An unknown slug is still `notFound`.
  - The profile and fallback tests now render `CreatorView` for a signed-in viewer.
- `creator-posts.test.tsx`: the guest premium tile is a link to the post with no sheet. The existing sheet cases run signed in.
- `pnpm check` green: shared 207, web 384, api 623. Web build green with the Proxy registered.

## Notes
- The test environment logs React's "async Client Component" warning when an async server component suspends under a client render. This is pre-existing for every Suspense'd server-component test and doesn't happen at runtime.
- Manual UAT, signed out:
  - `/`, `/discover`, `/me`, `/wallet` and `/library` land on `/login` and return after login.
  - `/{slug}` and its posts have no header or nav, and each action → `/login` → back.
