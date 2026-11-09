# Technical Plan: US-068 — Pengaturan Page UI

## Architecture Overview

- **Page:** `/account/settings` becomes a server page with `PageHeader` that streams the current user (`getCurrentUser`) into a client `SettingsView`. Rows are grouped as in artboard state `settings`.
- **Notification toggles:** they use the final shared contract (`NotificationPreferences`) through `lib/api/notification-preferences.ts`, which is dummy (module state) until US-073.
- **"Pesan Telegram":** shows a connect button that is disabled until US-074 ("Segera hadir").
- **Autoplay:** a device preference (`lib/autoplay-preference.ts`, browser storage). `PostVideo` treats "off" exactly like the existing reduced-motion/data-saving tap-to-play path, so no new player branches.
- **Hapus akun:** a `BottomSheet` with role-specific rules marked "Perlu konfirmasi" and only "Batal". No API call.

## Dependencies

- TASK-221 is not needed. This story adds its own contract in `packages/shared/src/notifications.ts` (preferences part).
- Existing: `useLogout` (`components/use-logout.ts`), `LegalSheet` (`app/(auth)/login/legal-sheet.tsx`), `BottomSheet`, `useToast`, `getCurrentUser` (`roles`, `creatorSlug`, `username`).

## Risks

- **`LegalSheet` lives under the login route.** Move it to `components/legal-sheet.tsx` (update the login import + test) instead of importing across route folders.
- **App version.** `apps/web/package.json` is `0.0.0`. Expose it as `process.env.NEXT_PUBLIC_APP_VERSION` set in `next.config` from `package.json` `version`; don't hardcode it.

## Tasks

### TASK-223: Autoplay preference (device) + PostVideo honours it

- `apps/web/src/lib/autoplay-preference.ts`:
  ```ts
  export const AUTOPLAY_KEY = 'influency:autoplay';
  export function readAutoplayEnabled(): boolean   // localStorage value 'off' → false; anything else/no storage → true
  export function setAutoplayEnabled(on: boolean): void  // write 'on'/'off' (try/catch) + notify listeners
  export function useAutoplayEnabled(): boolean    // useSyncExternalStore; server snapshot true
  ```
- `apps/web/src/components/post-video.tsx`: `const autoplay = useAutoplayEnabled();` and use `prefersTap || !autoplay` wherever `prefersTap` gates autoplay today. That gives tap-to-play everywhere (feed, profile, viewer, Jelajahi).

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| CREATE | `apps/web/src/lib/autoplay-preference.ts` (+ `.test.ts`) | Device preference |
| MODIFY | `apps/web/src/components/post-video.tsx` (+ `post-video.test.tsx`) | Respect it |

**Testing:** default on; 'off' → false; storage throwing → true; PostVideo with autoplay off does not call `play()` when visible and shows the tap-to-play button.

---

### TASK-224: Pengaturan page

- Shared (`packages/shared/src/notifications.ts`; create the file if TASK-221 hasn't yet):
  ```ts
  export const notificationPreferencesSchema = z.object({
    newPost: z.boolean(), commentReply: z.boolean(), commentLike: z.boolean(), subscriptionReminder: z.boolean(),
    earnings: z.boolean().nullable(),       // null = not an approved creator (row hidden)
    telegram: z.object({ status: z.enum(['unavailable','not_connected','connected']), allowed: z.boolean() }),
  });
  export const updateNotificationPreferencesSchema = z.object({
    newPost: z.boolean(), commentReply: z.boolean(), commentLike: z.boolean(), subscriptionReminder: z.boolean(),
    earnings: z.boolean(), telegramAllowed: z.boolean(),
  }).partial().strict();
  export const NOTIFICATION_PREFERENCE_DEFAULTS = { newPost: true, commentReply: true, commentLike: false, subscriptionReminder: true, earnings: true } as const;
  ```
- `apps/web/src/lib/api/notification-preferences.ts`: `fetchNotificationPreferences()`, `updateNotificationPreferences(patch)`. Bodies: `// shortcut: in-memory preferences until US-073 swaps these to /me/notification-preferences.` Defaults from `NOTIFICATION_PREFERENCE_DEFAULTS`, `telegram: { status: 'unavailable', allowed: false }`.
- `apps/web/src/app/(subscriber)/account/settings/page.tsx`: replace `ComingSoon` with `PageHeader` ("Pengaturan", `asHeading`) + `Suspense` → `SettingsView user={await getCurrentUser()}`.
- `apps/web/src/components/settings/settings-view.tsx` (`'use client'`), groups (`<section aria-labelledby>` with `<h2>`):
  1. **Akun:** "Edit Profil" → `/studio/profile` for approved creators (`user.creatorSlug`), `/me` otherwise (the user Edit Profil sheet lives in `ProfileSummary`). "Telegram" row showing `@{username} · Terhubung` (or `Terhubung` without a username), not clickable. "Rekening Pencairan" → `/studio/payout-accounts` for approved creators only (use the route creator-studio US-057 defines; check `apps/web/src/app/studio/` at implementation time).
  2. **Notifikasi:** `SettingsToggle` rows ("Postingan baru" / "Dari creator yang kamu ikuti", "Balasan komentar", "Suka pada komentarmu", "Pengingat langganan" / "Sebelum periode langganan berakhir", and "Aktivitas penghasilan" / "Subscriber baru, unlock dan tip" only when `earnings !== null`). The story's "Balasan dan sebutan" becomes "Balasan komentar": mentions don't exist. "Pesan Telegram": when `status === 'connected'`, a toggle bound to `telegramAllowed`; otherwise a "Hubungkan" button (`disabled` with "Segera hadir" while `unavailable`; US-074 wires it).
  3. **Preferensi:** "Putar video otomatis" / "Tanpa suara, hanya saat terlihat" bound to `useAutoplayEnabled` / `setAutoplayEnabled`.
  4. **Privasi dan keamanan:** "Akun diblokir" and "Laporkan masalah", each opening a `BottomSheet` with a "Perlu konfirmasi" pill and one line of text.
  5. **Bantuan dan legal:** "Pusat bantuan" (same placeholder sheet), "Syarat Layanan" and "Kebijakan Privasi" → `LegalSheet` (moved to `components/legal-sheet.tsx`).
  6. **Keluar** (red text) → `useLogout()`.
  7. "Hapus akun" (outlined red button) → `BottomSheet` "Hapus akun?" with a "Perlu konfirmasi" pill. Creator text: "Profil, postingan dan paket langganan akan dihapus. Penghasilan tertunda dan pembelian yang ada perlu diselesaikan dulu." User text: "Profil, daftar ikuti dan simpanan akan dihapus. Nasib Koin yang belum terpakai dan pembelian perlu dikonfirmasi." One "Batal" button closes it. There is no delete button.
  - Footer: `Influency · versi {NEXT_PUBLIC_APP_VERSION}`.
- `SettingsToggle`: `<button role="switch" aria-checked={on} aria-labelledby aria-describedby>` with 44px height, coral track when on. Optimistic: flip, call `updateNotificationPreferences({ [key]: next })`, on failure roll back + `toast('Gagal menyimpan pengaturan.')`. Disable while pending.

**Files:**
| Action | File Path | Purpose |
|--------|-----------|---------|
| MODIFY | `packages/shared/src/notifications.ts` (+ test) | Preferences schemas + defaults |
| CREATE | `apps/web/src/lib/api/notification-preferences.ts` | Dummy source |
| MODIFY | `apps/web/src/app/(subscriber)/account/settings/page.tsx` | Real page |
| CREATE | `apps/web/src/components/settings/settings-view.tsx` | Groups |
| CREATE | `apps/web/src/components/settings/settings-toggle.tsx` | Switch row |
| CREATE | `apps/web/src/components/settings/settings-view.test.tsx` | Tests |
| MOVE   | `apps/web/src/app/(auth)/login/legal-sheet.tsx` → `apps/web/src/components/legal-sheet.tsx` | Shared legal sheet (update login import/test) |
| MODIFY | `apps/web/next.config.ts` | `NEXT_PUBLIC_APP_VERSION` from package.json |

**Testing (`{ wrapper: Toaster }`):**
- A plain user sees no "Rekening Pencairan" and no "Aktivitas penghasilan"; an approved creator sees both; Edit Profil links by role.
- Toggle: `role="switch"`, `aria-checked` flips; on API failure it rolls back and shows the toast.
- Autoplay toggle writes the preference.
- Hapus akun sheet shows the role text and the "Perlu konfirmasi" pill, has only "Batal", and makes no API call.
- Keluar calls the logout hook; Syarat/Kebijakan open the legal sheet.
