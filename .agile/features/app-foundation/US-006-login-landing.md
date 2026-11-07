# US-006: Login Landing

**Status:** backlog
**Priority:** high
**Feature:** app-foundation

## Description

As a visitor, I want a simple, attractive login page with one clear button, so that I can sign in with Telegram without confusion.

## Acceptance Criteria

- [ ] `/login` is standalone, with no app shell. It has the Influency logo, a hero visual, the headline "Lebih dekat dengan creator favoritmu" and a subline: "Ikuti creator, buka post premium, dan berlangganan dengan Koin, semua di satu tempat."
- [ ] One primary button, **Masuk dengan Telegram**, starts the existing OIDC flow with `returnTo` preserved. The existing login error message, the dev-only login links and the in-app-browser "Buka di browser" notice keep working.
- [ ] The **Syarat** and **Kebijakan Privasi** links open a bottom sheet (US-002) with placeholder text marked "Teks final dari legal", a "Terakhir diperbarui: [TANGGAL]" line and a **Selesai** button.
- [ ] A signed-in user who opens `/login` is redirected to their `returnTo` path, or to `/` when there is none.
