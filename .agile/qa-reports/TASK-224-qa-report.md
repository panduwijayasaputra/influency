# QA Report: TASK-224 — Pengaturan page

**Story:** US-068
**Result:** PASS
**Tester:** qa-agent

## Code Review

### Guidelines Compliance
- [x] `/account/settings`: `Suspense` → server session check → `redirect(loginHref('/account/settings'))`, `PageHeader asHeading`; `SettingsView` client component
- [x] Shared contract in `packages/shared/src/notifications.ts`: `notificationPreferencesSchema`, `updateNotificationPreferencesSchema` (partial + strict), `NOTIFICATION_PREFERENCE_DEFAULTS`
- [x] `lib/api/notification-preferences.ts`: in-memory dummy with a `// shortcut:` note naming US-073; Telegram reported as `unavailable`
- [x] `LegalSheet` moved to `components/legal-sheet.tsx` (git mv, test moved too) with an optional `trigger`; the login page import is updated and its default inline link is unchanged
- [x] Plan deviation: the app version comes from importing `apps/web/package.json` in the server page (`resolveJsonModule` is on) instead of a `NEXT_PUBLIC_APP_VERSION` in `next.config.ts`. It is simpler, with no config change and no client env.

### Security
- [x] "Hapus akun" performs no request: the sheet only has "Batal" (tested)
- [x] Logout reuses `useLogout` (same-origin POST); no new mutation paths besides the (dummy) preference update

### Accessibility
- [x] `SettingsToggle`: `<button role="switch" aria-checked aria-labelledby aria-describedby>`, 44 px target, disabled while saving, `motion-reduce` respected
- [x] Groups are `<section aria-labelledby>` with `<h2>`; rows ≥ 52 px; placeholder and legal sheets are labelled dialogs

### Code Quality
- [x] Optimistic toggle with rollback + toast "Gagal menyimpan pengaturan."; loading and load-error states for the notification group
- [x] Role rules: Rekening Pencairan (`/studio/payout-accounts`, which exists) and Aktivitas penghasilan only for approved creators (`creatorSlug`); Edit Profil → `/studio/profile` for creators, `/me` otherwise

## Acceptance Criteria (US-068)

| AC | Result |
|---|---|
| Grouped rows per artboard (Akun, Notifikasi, Preferensi, Privasi dan keamanan, Bantuan dan legal, Keluar, Hapus akun) | PASS |
| Toggles with defaults, accessible switches, optimistic save + rollback toast; Pesan Telegram off until consent | PASS. "Balasan dan sebutan" is labelled "Balasan komentar" (no mentions exist, per the plan). "Hubungkan" is disabled with "Segera hadir" until US-074. |
| "Putar video otomatis" per device stops autoplay everywhere | PASS (TASK-223) |
| Placeholder rows "Perlu konfirmasi"; legal sheets as on login; Keluar; app version footer | PASS |
| Hapus akun: role rules + "Perlu konfirmasi", only "Batal" | PASS |

## Testing

- `components/settings/settings-view.test.tsx` (9): user vs creator rows; defaults + Telegram unavailable; save; rollback + toast; autoplay persisted; placeholder, legal sheet and logout; delete sheet for both roles (no delete button, no request).
- `app/(subscriber)/account/settings/page.test.tsx` (2): signed-in render with the package version; guest redirect.
- Moved `components/legal-sheet.test.tsx` and the login page tests still pass.
- Full web suite: 125 files / 939 tests pass; ESLint, Prettier and `tsc` clean.

## Notes

- The language selector from the design is intentionally absent (UI is Bahasa Indonesia only, feature decision).
