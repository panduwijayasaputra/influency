# US-005: Right Account Drawer

**Status:** ready_for_uat
**Priority:** high
**Feature:** app-foundation

## Description

As a signed-in user, I want an account drawer that slides in from the right, so that I can reach my wallet and account pages from one place.

## Acceptance Criteria

- [x] The burger opens a drawer from the **right**. It has a backdrop and an X button, and closes on the X, a backdrop tap or Escape. Focus is trapped while it is open and returns to the burger on close. The page behind keeps its scroll position.
- [x] The drawer shows these items top to bottom:
  1. Avatar, display name and @username, from the real `/auth/me`.
  2. A Koin balance card with **Beli Koin** (→ `/wallet`).
  3. **Profil Saya** (→ `/me`).
  4. **Penghasilan** (→ `/studio/earnings`), only for approved creators.
  5. **Jadi Creator** (→ `/become-creator`), only for non-creators.
  6. **Koleksi Saya**.
  7. **Diikuti**.
  8. **Langganan**.
  9. **Pengaturan**.
  10. **Keluar**.
- [x] The Koin balance is dummy until the koin-wallet feature and is visibly marked as demo. Links to pages that don't exist yet open a "Segera hadir" placeholder.
- [x] **Keluar** uses the existing logout flow and lands on `/login`. The old `account-menu`/`UserMenu` is replaced by this drawer.
- [x] At 320–430 px the drawer fits inside the viewport and its content scrolls if needed.

## Tasks

### TASK-012: Telegram username on auth identities and `/auth/me`
**Status:** done

### TASK-013: AccountDrawer component, logout to `/login` and `/following` placeholder
**Status:** done

### TASK-014: Drawer on the Home top bar, remove old account menu, guidelines
**Status:** done
