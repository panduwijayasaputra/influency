# Influency Roadmap (after the 2026-11-07 reset)

The backlog was reset on 2026-11-07. Existing code stays. The old stories, plans and QA reports are in [archive/2026-11-07-pre-reset/](archive/2026-11-07-pre-reset/).

## How we work

- **Per feature, UI first.** Each feature starts with UI stories. These follow [design/HANDOFF.md](../design/HANDOFF.md) and the [artboards](../design/artboards/) (Light Social coral, copy in Bahasa Indonesia).
- The UI uses existing APIs and fills gaps with dummy data. Backend stories in the same feature then replace that dummy data before we move on to the next feature.
- The financial rules come from [INFLUENCY_MONETIZATION_MVP_SPEC_v1.md](.docs/INFLUENCY_MONETIZATION_MVP_SPEC_v1.md). The technical invariants come from [INFLUENCY_MVP_CLAUDE_HANDOFF_v1.md](.docs/INFLUENCY_MVP_CLAUDE_HANDOFF_v1.md) and CLAUDE.md.
- [INFLUENCY_MOBILE_FIRST_UI_UX_SPEC_v1.0.md](.docs/INFLUENCY_MOBILE_FIRST_UI_UX_SPEC_v1.0.md) (Dark Social) is superseded by the design for visuals, navigation, Home, comment sort and Collection. Its rules on private premium comments, video Option B and comment edit/delete/pin still apply.

## Feature order

| # | Feature | Contents (UI → backend) |
|---|---|---|
| 1 | `app-foundation` | Light Social tokens, BottomSheet/Toast, app shell (4-tab bottom nav, Home top bar), right drawer, Login landing |
| 2 | `creator-profile` | PostCard + carousel, creator profile (header, Postingan, Grid), post detail, full-screen viewer, muted autoplay |
| 3 | `comments` | Comments sheet (pinned, replies, comment likes, edit, delete) → replies/pin/like/edit API |
| 4 | `home-feed` | Home feed + "Creator untukmu" + Ikuti → follow & feed API |
| 5 | `koin-wallet` | Dompet page, Beli Koin → wallet ledger, packages, Midtrans Sandbox top-up |
| 6 | `purchases` | Unlock/Langganan/Tip sheets → atomic unlock, subscription, tip, revenue ledger |
| 7 | `user-area` | Koleksi Saya (Disimpan/Dibeli), Diikuti, Langganan, My Profile → save API, library |
| 8 | `onboarding` | `/welcome` stepper (user & creator paths) |
| 9 | `creator-studio` | Post Baru/Edit form, Edit Profil, Penghasilan, Rekening Pencairan → earnings & payouts |
| 10 | `discover-notifications-settings` | Jelajahi (video + cari), Notifikasi, Pengaturan → notifications/bot |

Admin and finance operations (reconciliation, refunds, audit log) and the end-to-end sandbox journey follow after these features.

## Indonesian UI labels

| Design | UI |
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

OPEN items in the design are rendered as placeholders labelled "Perlu konfirmasi" and are never presented as policy.
