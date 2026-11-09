# Feature: Discover, Notifications & Settings

**Slug:** discover-notifications-settings
**Handoff phase:** Phase 2/3 (public creator discovery, media access) for Jelajahi; Phase 5 (bot notification after top-up, handoff §2 and §13) for Notifikasi and the Telegram bot; §5.4 (bot consent) and §12 (consent records, opt-out) for Pengaturan. Feature #10 in [roadmap.md](../../roadmap.md).

## Overview

1. **Jelajahi → Video:** full-screen, vertical, snap-scrolling feed of creator videos (muted autoplay, Ikuti, open profile).
2. **Jelajahi → Cari:** search creators by name or username, plus a "Baru dilihat" (recently viewed) list. The top-bar search icon on Beranda opens this tab.
3. **Notifikasi:** in-app inbox with unread highlight; the bell in the Beranda top bar shows an unread dot.
4. **Pengaturan:** account info, notification toggles, autoplay preference, privacy/help/legal links, Keluar, and a "Hapus akun" placeholder.
5. **Telegram bot delivery:** the one official Influency bot sends opt-in summaries with a link to the website.

Per the roadmap, UI stories (US-065 to US-068) come first and use one swappable dummy data source where no API exists. Backend stories (US-069 to US-074) replace it.

## Sources

- Artboard (reference only): [Home.dc.html](../../../design/artboards/Home.dc.html), states `discover` (tabs Discover/Search, `REELS`, `RECENT_SEED`), `notifications` (`NOTIFS`) and `settings` (groups Account, Notifications, Preferences, Privacy and safety, Help and legal, Log out, Delete account).
- Handoff §5.4 (bot consent; 403 → stop deliveries; no premium media or payout data in messages), §13 (jobs `notification.topup-success`, `notification.subscription-expiring`, `notification.new-post`; transactional outbox; notification failure never undoes a financial transaction), data model (`notification_preferences`, `notification_jobs`), §2 out of scope: recommendation algorithm.
- Design handoff rule: locked premium never sends originals.
- Existing code reused: `/discover`, `/notifications`, `/account/settings` routes (currently `ComingSoon`), `VideoMedia` muted autoplay, follow API (US-022–US-026), `PostAccessService`, media access URLs, auth session/logout, Telegram OIDC client (scope `openid profile` today).

## Decisions

- **Jelajahi Video shows free videos only.** Published, READY videos on free posts from approved creators. Premium videos are left out entirely (no blurred reel), so no premium original can leak through this surface. The viewer's own posts are excluded.
- **Ordering is newest first.** No ranking/recommendation algorithm (handoff §2 out of scope).
- **"Baru dilihat" is stored per device** (browser storage), not on the server: max 20 entries, cleared with browser data. No server-side view history is kept.
- **Notification toggles decide whether a notification is created at all** (inbox and Telegram). Top-up success and payout status are transactional: always delivered in the inbox, no toggle.
- **Telegram delivery needs explicit consent** through a separate "Pesan Telegram" toggle. Turning it on requests bot access (OIDC `telegram:bot_access` or the bot `/start` link, whichever current Telegram docs support). Messages hold a summary + website link only.
- **Autoplay preference is per device** (browser storage), default on, and applies to every `VideoMedia`.
- **The UI is Bahasa Indonesia only.** The design's Language selector is left out.
- Design copy is English; the UI uses Bahasa Indonesia.

## Open points (rendered as "Perlu konfirmasi")

- The final list of notification events (the design labels it a proposal). Stories use the event list in US-072 as the configurable default.
- Account deletion rules (unused Koin, purchases, creator pending earnings). "Hapus akun" shows the rules as "Perlu konfirmasi" and deletes nothing.
- Akun diblokir, Laporkan masalah, Pusat bantuan: placeholder rows.
- New-post fan-out throttle (configurable example: at most 1 new-post notification per creator per follower per hour).
- Subscription reminder lead time (configurable example: 3 days before the period ends).

## Stories

| ID | Title | Priority |
|---|---|---|
| US-065 | Jelajahi Video Tab UI | high |
| US-066 | Jelajahi Cari Tab UI | high |
| US-067 | Notifikasi Page UI | high |
| US-068 | Pengaturan Page UI | medium |
| US-069 | Discover Videos API | high |
| US-070 | Creator Search API | high |
| US-071 | Notifications Inbox API | high |
| US-072 | Notification Events | high |
| US-073 | Notification Preferences API | medium |
| US-074 | Telegram Bot Notification Delivery | medium |
