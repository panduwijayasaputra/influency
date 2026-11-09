# US-068: Pengaturan Page UI

**Status:** ready_for_uat
**Priority:** medium
**Feature:** discover-notifications-settings

## Description

As a logged-in user, I want a Pengaturan page, so that I can control notifications and video autoplay and find help, legal pages and Keluar in one place.

## Acceptance Criteria

- [ ] `/account/settings` (logged-in only) replaces `ComingSoon` with grouped rows per artboard state `settings`: **Akun** (Edit Profil → the existing edit flow, Telegram `@username · Terhubung` read-only, Rekening Pencairan for approved creators only), **Notifikasi**, **Preferensi**, **Privasi dan keamanan**, **Bantuan dan legal**, **Keluar**, **Hapus akun**.
- [ ] Notifikasi toggles: Postingan baru (default on), Balasan dan sebutan (on), Suka pada komentarmu (off), Pengingat langganan (on), Aktivitas penghasilan (on, approved creators only) and "Pesan Telegram" (off until consent). Toggles are accessible switches (`role="switch"`, `aria-checked`), save optimistically and roll back with a toast on failure; dummy source until US-073.
- [ ] Preferensi: "Putar video otomatis" (default on) is stored per device; when off, `VideoMedia` everywhere (feed, profile, Jelajahi) no longer autoplays.
- [ ] Akun diblokir, Laporkan masalah and Pusat bantuan are placeholder rows marked "Perlu konfirmasi"; Syarat Layanan and Kebijakan Privasi open the same pages as the login screen; Keluar uses the existing logout; the footer shows the app version.
- [ ] "Hapus akun" opens a confirmation showing the role-specific rules marked "Perlu konfirmasi" with only a "Batal" action: no account is deleted. Component tests cover role-dependent rows, toggle save/rollback, the autoplay preference and the delete placeholder.

## Tasks

### TASK-223: Autoplay preference (device) + PostVideo honours it
**Status:** done

### TASK-224: Pengaturan page
**Status:** done
