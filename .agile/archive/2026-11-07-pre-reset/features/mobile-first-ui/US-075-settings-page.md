# US-075: Settings Page

**Status:** backlog
**Priority:** low
**Feature:** mobile-first-ui

## Description

As a signed-in user, I want a settings page, so that I can manage my account, notifications and preferences.

## Acceptance Criteria

- [ ] **Pengaturan** (`/account/settings`) has these grouped sections:
  - **Akun**: Edit profil → US-074; Telegram "@username · Terhubung"; Rekening Pencairan, for creators only.
  - **Notifikasi**: toggles for Post baru, Balasan & mention, Suka pada komentarmu and Pengingat langganan. Creators also get Aktivitas penghasilan.
  - **Preferensi**: Putar video otomatis (feeds US-057).
  - **Privasi & keamanan**: Akun yang diblokir and Laporkan masalah.
  - **Bantuan & legal**: Pusat bantuan, Syarat Layanan and Kebijakan Privasi. The last two open the same sheet as US-069.
- [ ] **Keluar** (danger style) logs out via the existing flow. **Hapus akun** asks for confirmation and ends in a "Perlu konfirmasi" message; no account is deleted.
- [ ] Notification toggles are dummy until US-035 and are labelled as demo. The autoplay toggle is stored per device.
- [ ] Rows marked "Perlu konfirmasi" in the design (blocked accounts, report, help center) show that message instead of navigating. A version line "Influency · versi X.Y.Z" sits at the bottom.
