# US-069: Login Landing

**Status:** backlog
**Priority:** high
**Feature:** mobile-first-ui

## Description

As a visitor, I want a simple, attractive login page with one clear button, so that I can sign in with Telegram without confusion.

## Acceptance Criteria

- [ ] `/login` is standalone, with no app shell. It has the Influency logo, a hero visual, the headline "Lebih dekat dengan creator favoritmu" and a short subline about following, unlocking and subscribing with Koin.
- [ ] One primary button, **Masuk dengan Telegram**, starts the existing OIDC flow and preserves `returnTo`. The existing error message, dev-login links (dev only) and in-app-browser "Buka di browser" notice keep working.
- [ ] The "Syarat" and "Kebijakan Privasi" links open a bottom sheet. The sheet holds placeholder text marked "Teks final dari legal", a "Terakhir diperbarui: [TANGGAL]" line and a Selesai button.
- [ ] A signed-in user visiting `/login` is redirected to `returnTo` or Home.
