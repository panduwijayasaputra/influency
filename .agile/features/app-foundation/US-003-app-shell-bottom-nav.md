# US-003: App Shell & 4-Tab Bottom Nav

**Status:** ready_for_uat
**Priority:** high
**Feature:** app-foundation

## Description

As a user, I want a fixed bottom tab bar on every app page, so that I can move between the main areas like in a native app.

## Acceptance Criteria

- [x] The bottom nav has exactly four tabs, in this order, each with icon and label: **Beranda** (`/`), **Jelajahi** (`/discover`), **Dompet** (`/wallet`), **Profil** (`/me`).
  - It is fixed and respects `safe-area-inset-bottom`.
  - The active tab is clearly marked.
  - Page content is never hidden behind it.
- [x] The bottom nav is visible on every regular app page, including a creator profile opened directly from a bio link by a guest.
- [x] It is hidden on standalone pages: `/login`, onboarding, studio forms and `/admin`.
- [x] Pages other than Home use a simple page header (title, plus a back button when the page was opened from inside the app) instead of the old `SiteHeader`. The Dark Social bottom nav (Jelajahi/Koleksi/Langganan/Dompet) and `SiteHeader` are replaced.
- [x] Tabs whose pages don't exist yet (Jelajahi, Dompet, Profil, and Beranda content) show a "Segera hadir" placeholder in the new style. `me` is added to the reserved slugs.

## Tasks

### TASK-007: Bottom nav, AppChrome shell and `me` reserved slug
**Status:** done

### TASK-008: PageHeader, restyled ComingSoon, Beranda and `/me` placeholders
**Status:** done

### TASK-009: PageHeader on existing pages, standalone headers and guidelines
**Status:** done
