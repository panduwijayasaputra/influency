# US-074: Edit Profile

**Status:** backlog
**Priority:** medium
**Feature:** mobile-first-ui

## Description

As a user or creator, I want to edit my profile in one place, so that my page looks the way I want.

## Acceptance Criteria

- [ ] **Edit Profil** (from the profile header or Pengaturan) has these fields:
  - cover: change with a 3:1 crop
  - avatar: change with a square crop
  - Nama (required)
  - @username (validated: reserved slugs and duplicates are rejected with a clear message)
  - Bio
- [ ] Creators also see **Harga langganan** (Koin / 30 hari, 10–5.000). It carries the note "Satu paket per creator · 30 hari · perpanjangan manual". Whether a new price applies to existing subscribers is marked "Perlu konfirmasi". It is dummy until US-026.
- [ ] Saving uses the existing creator profile API (US-012) where fields exist. The existing studio profile editor is restyled, not rewritten.
- [ ] Unsaved changes are kept if a save fails. Inline errors are shown in Bahasa Indonesia.
