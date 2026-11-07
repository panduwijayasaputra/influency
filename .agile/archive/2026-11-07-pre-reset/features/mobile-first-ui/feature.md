# Feature: Mobile-First UI/UX (Light Social rework)

**Slug:** mobile-first-ui
**Handoff phase:** Cross-cutting UI pass over Phases 2–6 (public route, content, wallet, purchases, earnings), ahead of the remaining backend stories.

## Sources of truth (in priority order)

1. [design/HANDOFF.md](../../../design/HANDOFF.md), and especially its "Changes since the brief" section. This is the latest design decision.
2. [design/artboards/](../../../design/artboards/) holds the screens. [Home.dc.html](../../../design/artboards/Home.dc.html) is the master prototype. S03–S14 are the screen inventory and acceptance list. Use them as reference only and never copy `.dc.html` into the app.
3. [design/brief/INFLUENCY_CLAUDE_DESIGN_CONTEXT_v1.0.md](../../../design/brief/INFLUENCY_CLAUDE_DESIGN_CONTEXT_v1.0.md) is the original brief. Where it disagrees with HANDOFF, HANDOFF wins. `Decisions.dc.html` is partly outdated.
4. [INFLUENCY_MONETIZATION_MVP_SPEC_v1.md](../../.docs/INFLUENCY_MONETIZATION_MVP_SPEC_v1.md) holds every price, fee, tip and subscription rule.
5. [INFLUENCY_MOBILE_FIRST_UI_UX_SPEC_v1.0.md](../../.docs/INFLUENCY_MOBILE_FIRST_UI_UX_SPEC_v1.0.md) (Dark Social) is **superseded** for visuals, navigation, Home tabs, comment sort and Collection. These rules from it **still apply**: private premium comments, video Option B, comment edit/delete/pin and preserve-replies. Spec IDs like CMT-03 may still be cited.

## Overview

Rebuild the web UI to the Light Social coral design. This covers:

- tokens
- the app shell (Home-only top bar, 4-tab bottom nav, right drawer)
- the reusable post card with Save
- the post detail page and full-screen viewer
- the comments sheet
- the unlock, subscribe and tip sheets
- Home, Creator Profile, My Profile, Collection, Following, Subscriptions, Discover, Notifications, Wallet and Settings
- the creator-only surfaces: New/Edit post, Edit profile, Earnings and Payout accounts
- the Login landing and the onboarding stepper

## Decisions for this feature (2026-11-07, supersede the 2026-11-04 list)

- **UI copy is Bahasa Indonesia.** Design labels map as follows:

  | Design (English) | UI (Indonesian) |
  |---|---|
  | Home | Beranda |
  | Discover | Jelajahi |
  | Wallet | Dompet |
  | Profile | Profil |
  | Notification | Notifikasi |
  | Buy Koin | Beli Koin |
  | My Profile | Profil Saya |
  | Earnings | Penghasilan |
  | Become a Creator | Jadi Creator |
  | My Collection | Koleksi Saya |
  | Following | Diikuti |
  | Subscriptions | Langganan |
  | Settings | Pengaturan |
  | Logout | Keluar |
  | Posts / Grid | Postingan / Grid |
  | Saved / Purchased | Disimpan / Dibeli |
  | Free / Premium | Gratis / Premium |
  | Follow / Subscribe / Subscribed | Ikuti / Langganan / Berlangganan |
  | Send Tip | Kirim Tip |
  | Edit Profile | Edit Profil |
  | New post | Post Baru |
  | Payout accounts | Rekening Pencairan |
  | Comment deleted | Komentar dihapus |
  | Edited | Diedit |
  | Log in with Telegram | Masuk dengan Telegram |
  | Recommended creators | Creator untukmu |

  The Settings language picker in the design is dropped because the UI is Indonesian only.
- **Rework replaces earlier work instead of deleting it.** Pages and components that already exist are adjusted to the new design and keep their real API wiring. These include:
  - creator page, post detail, likes, comments and report
  - studio post and profile forms
  - become-creator
  - the uncommitted Dark Social UI pass (bottom-nav, account-menu, purchase-sheet, koin, discover/library/wallet/subscriptions placeholders)

  US-053 goes back to backlog because its palette changes.
- **Routes:**

  | Screen | Route |
  |---|---|
  | Home | `/` (logged-in only) |
  | Discover | `/discover` |
  | Wallet | `/wallet` |
  | My Profile | `/me` |
  | Notifications | `/notifications` |
  | My Collection | `/library` |
  | Following | `/following` |
  | Subscriptions | `/subscriptions` |
  | Settings | `/account/settings` |
  | Onboarding | `/welcome` (path choice) and `/become-creator` (creator path) |
  | Creator: New/Edit post | `/studio/posts/...` |
  | Creator: Edit profile | `/studio/profile` |
  | Creator: Earnings | `/studio/earnings` |
  | Creator: Payout accounts | `/studio/payouts` |

  Every new top-level segment (`notifications`, `following`, `me`, `welcome`) is added to `RESERVED_SLUGS`.
- **OPEN items in the design** stay OPEN (Grid tile tap, non-creator profile body, checkout, notification events, Discover ranking). Build the design's placeholder and mark it "Perlu konfirmasi", never as policy.
  - **Grid tile tap** opens the full-screen viewer at that media item. This follows the design's media-tap rule and stays labelled as a proposal.

## Rules for dummy data

- Dummy values live in `apps/web/src/lib/demo.ts`. Each one names the story that will replace it. The UI marks demo-only areas.
- Dummy actions never pretend to move money or grant access. Unlock, Subscribe, Tip, Beli Koin and Request payout end in a "Demo" message, never a fake success. A real flow replaces the message once US-022–US-039 land.
- Dummy media uses placeholder images only. Never real premium originals or signed URLs.
- Where a real API exists (auth/me, creator page, posts, post access, media access, likes, comments, report, creator apply, profile edit, studio posts), the UI keeps using it.
- Dummy fills only what the backend lacks:
  - feed and recommended creators
  - follow and save
  - notifications
  - wallet, purchases and subscriptions
  - tips
  - earnings and payout accounts
  - settings toggles
  - the extended comment model (replies, pin, comment likes, edit)
- Backend for those is out of scope and needs its own stories.

## Stories

| ID | Title | Priority |
|---|---|---|
| US-053 | Light Social Design Tokens | high |
| US-054 | App Shell — Home Top Bar & 4-Tab Bottom Nav | high |
| US-055 | Right Account Drawer | high |
| US-056 | Reusable Post Card & Media Carousel | high |
| US-057 | Muted Autoplay Video | medium |
| US-058 | Home Feed with Recommended Creators | high |
| US-059 | Creator Profile — Header, Posts & Grid | high |
| US-060 | Comments Bottom Sheet | high |
| US-061 | Unlock, Subscribe & Tip Sheets | medium |
| US-062 | My Collection — Saved & Purchased | medium |
| US-063 | Following Page | medium |
| US-064 | Subscriptions Page | medium |
| US-065 | My Profile | medium |
| US-066 | Onboarding Stepper (User & Creator Paths) | medium |
| US-067 | Discover — Videos & Search | low |
| US-068 | Post Detail Page & Full-Screen Media Viewer | high |
| US-069 | Login Landing | high |
| US-070 | Notifications Page | low |
| US-071 | Wallet Page | medium |
| US-072 | Creator Earnings & Payout Accounts | low |
| US-073 | New / Edit Post Form | medium |
| US-074 | Edit Profile | medium |
| US-075 | Settings Page | low |
