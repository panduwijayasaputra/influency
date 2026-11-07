# US-055: Right Account Drawer

**Status:** backlog
**Priority:** high
**Feature:** mobile-first-ui

## Description

As a signed-in user, I want an account drawer that slides in from the right, so that I can reach my wallet and account pages from one place.

## Acceptance Criteria

- [ ] The Home burger opens a drawer from the **right**. It has a backdrop and an X button, and closes on the X, a backdrop tap or Escape. Focus moves into the drawer, is trapped while open, and returns to the burger on close.
- [ ] The drawer shows these items top to bottom:
  1. Avatar, display name and @username.
  2. A Koin balance card with a **Beli Koin** button (→ `/wallet`).
  3. **Profil Saya** (→ `/me`).
  4. **Penghasilan** (→ `/studio/earnings`), only for approved creators.
  5. **Jadi Creator** (→ `/become-creator`), only for non-creators.
  6. **Koleksi Saya**.
  7. **Diikuti**.
  8. **Langganan**.
  9. **Pengaturan**.
  10. **Keluar**.
- [ ] Keluar uses the existing logout flow (`useLogout`). Afterwards the user lands on the Login landing.
- [ ] The balance is dummy until US-022 and is marked as demo. It is never computed from client state as a real value.
- [ ] The drawer stays within the viewport on screens 320–430 px wide. Opening and closing it does not reset the scroll position of the page behind it.
