# US-065: My Profile

**Status:** backlog
**Priority:** medium
**Feature:** mobile-first-ui

## Description

As a signed-in user, I want the Profil tab to take me to my own profile, so that I can see how I appear and edit it.

## Acceptance Criteria

- [ ] Bottom **Profil** and drawer **Profil Saya** both go to `/me`, which resolves to the user's own profile.
- [ ] An approved creator gets their own creator profile (US-059 layout, owner variant), with Edit Profil, Post Baru, and an owner ··· menu on each post.
- [ ] A non-creator sees the shared header (cover, avatar, name, @username, Edit Profil). Below it is a restrained "Perlu konfirmasi" placeholder: no public activity, badges or purchases are shown.
- [ ] A guest sees "Profilmu ada di sini" with **Masuk atau daftar** (→ Login with `returnTo=/me`). `me` is a reserved slug.
