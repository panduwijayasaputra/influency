# US-007: Guest Access Rules in the Shell

**Status:** backlog
**Priority:** medium
**Feature:** app-foundation

## Description

As a guest, I want to be guided to log in only where an account is needed, so that I can still browse creator profiles freely.

## Acceptance Criteria

- [ ] Beranda (`/`) is for signed-in users only. A guest who opens it is redirected to `/login` with `returnTo=/`.
- [ ] A guest can open creator profiles and posts as today, with the bottom nav visible.
- [ ] As a guest, **Profil** shows "Profilmu ada di sini" and **Dompet** shows a matching prompt. Each has a **Masuk atau daftar** button that goes to `/login` with `returnTo` set to that page.
- [ ] The Home top bar and the drawer are never shown to a guest.
- [ ] After logging in, the user lands back on the page they came from (existing return-to validation; same-origin relative paths only).
