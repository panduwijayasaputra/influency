# US-054: App Shell — Home Top Bar & 4-Tab Bottom Nav

**Status:** backlog
**Priority:** high
**Feature:** mobile-first-ui

## Description

As a user, I want a familiar app frame with a fixed bottom tab bar and a top bar on Home, so that I can move around Influency like a native social app.

## Acceptance Criteria

- [ ] The bottom nav has exactly four tabs, in this order, each with icon and label: **Beranda · Jelajahi · Dompet · Profil**.
  - It shows a visible active state, is fixed, and respects `safe-area-inset-bottom`.
  - It is visible on every regular app page, including a creator profile opened from a bio link by a guest.
  - It is hidden on standalone pages: Login, onboarding (`/welcome`, `/become-creator`), studio forms and admin.
- [ ] The top bar appears **on Home only**. It shows the Influency logo on the left (tap goes to Home), then Search (→ `/discover`), a Notifikasi bell (→ `/notifications`, with an unread dot when there are new items) and a burger that opens the right account drawer (US-055).
- [ ] The Home top bar hides while scrolling **down** and shows again on scrolling **up** or at the top of the page. Under `prefers-reduced-motion` it toggles without animation.
- [ ] Other app pages use a simple page header (title, plus a back button where the page was opened from another page) instead of the Home top bar. The current Dark Social `SiteHeader` and old bottom nav (Jelajahi/Koleksi/Langganan/Dompet) are replaced.
- [ ] For a guest:
  - **Profil** shows a "Masuk atau daftar" prompt linking to the Login landing with `returnTo`.
  - **Dompet** shows the same login prompt.
  - **Beranda** redirects to Login (see US-058).
