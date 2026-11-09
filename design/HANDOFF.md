# Influency — design handoff for Claude Code

This folder is the source of the Influency design canvas (mobile-first, 390×844 baseline).
Use it as the **reference** for building the real app. The `.dc.html` files are prototype
markup for a design tool (they rely on a runtime `support.js` that is not included), so
**do not copy them into the app**. Re-implement them as components in this repo's stack
and conventions.

## Files

| Path | What it is |
|---|---|
| `artboards/Home.dc.html` | **Master prototype.** Every screen lives here as a state: Home feed, creator profile (Posts/Grid), comments sheet, post detail, full-screen media viewer, drawer, collection, following, subscriptions, discover (reels + search), notification, wallet, earnings, payout accounts, settings, create/edit post, edit profile, unlock/subscribe/tip sheets. Data + logic are in the `<script>` at the bottom. |
| `artboards/PostCard.dc.html` | The reusable post card (carousel, video states, premium preview, like/comment/share/save, Send Tip, unlock CTA). |
| `artboards/Login.dc.html` | Landing / login with one "Log in with Telegram" button, Terms & Privacy sheet. |
| `artboards/Welcome.dc.html` | Onboarding stepper: choose path → user (Profile, Interests, Follow) or creator (Profile, Subscription, Payout, Review). |
| `artboards/S03…S14*.dc.html` | Thin wrappers that open Home in a given state (role + start screen). Useful as a **screen inventory** / acceptance list. |
| `artboards/System.dc.html` | Tokens, type scale, controls, component map. |
| `artboards/Decisions.dc.html` | LOCKED / PROPOSAL / OPEN register (partly outdated — see "Changes since the brief"). |
| `brief/INFLUENCY_CLAUDE_DESIGN_CONTEXT_v1.0.md` | Original product brief. |

## Design tokens

| Token | Value | Use |
|---|---|---|
| primary | `#EF8176` | brand coral: logo, active indicators, liked heart, selection rings |
| primary.strong | `#D9584C` | filled buttons with white text (AA) |
| primary.ink | `#B4463B` | coral text links on white |
| primary.soft | `#FFE8E2` | chips, badges, soft surfaces |
| koin | `#D6A443` | Koin coin mark; Koin surfaces `#FFF6E5` + text `#6B4A0E` |
| canvas | `#FAFAFA` | app background |
| surface | `#FFFFFF` | cards, bars, sheets |
| text | `#25262B` | primary text |
| muted | `#6B6B75` | metadata (AA on white) |
| border | `#ECE8E7` | hairlines |
| danger | `#B42318` | destructive |
| success | `#1E6B3A` on `#E6F4EA` | Active / Unlocked badges |

Font: Plus Jakarta Sans (400–800). Radii: 9 segment · 12–14 buttons/inputs · 16 cards/media · 20 recommended cards · 22 sheets.
Touch targets ≥ 44px. Primary buttons 48–52px. Side gutter 16px. Desktop: keep a 480–560px column.

## Business rules the UI must respect

- 1 Koin = Rp1.000; top-up packages 10/25/50/100/250.
- Premium post price 5–1,000 Koin; unlock is non-expiring while available.
- One subscription plan per creator, 30 days, 10–5,000 Koin, **manual renewal**.
- Tips 1–1,000 Koin; only on accessible premium posts (and only if viewer subscribes or bought from that creator); never self-tip; 0% fee.
- Fees: 20% unlock, 15% subscription, 0% tips.
- Locked premium: **never send original media**; show server-blurred preview; comments of locked posts are private (no names/avatars/text).
- Saving ≠ entitlement. Liking ≠ entitlement.
- Max 5 media per post. Payout accounts: max 3, exactly one active, active can't be deleted.

## Changes since the brief (decided during design review)

- Bottom nav: **Home · Discover · Wallet · Profile** (Notification moved to a bell in the top bar).
- Top bar shown **on Home only**: logo · search · bell · burger (opens right drawer). Hides on scroll **down**, shows on scroll **up**.
- Home has **no** For You / Following tabs — one feed. "Recommended creators" block after the 5th post (pages of 3, full-width cards, draggable).
- Home is **logged-in only**; guests go to Login. Guests can still open creator profiles from bio links.
- Comments: **no Top/Recent toggle** (Top order, pinned first).
- Tapping caption → post detail page (content + comments + sticky input). Tapping media → full-screen viewer (9:16, swipe/drag, Like · Comment · Share · Send Tip row; comments open as ~40% sheet).
- Creator profile header: cover, avatar, Edit Profile on the cover line (owner), name, @username + Message/Share icons, stats row (photos · videos · followers), 2-line bio with Show more, Follow + Subscribe equal width ("x days left" under Subscribed). Posts/Grid tabs are not sticky. Grid filters: Media dropdown + Access segmented.
- Post card actions: Like · Comment · Share · **Save** on the left, Send Tip on the right.
- My Collection: Saved / Purchased (not Liked), creator filter is a dropdown.
- Creator-only: New post / Edit post form, Earnings, Payout accounts. Settings screen added.

## Suggested build order

1. Tokens + fonts in the repo's styling system.
2. `AppShell` (top bar, bottom nav, safe areas, drawer), `BottomSheet`, `Toast`.
3. `PostCard` (+ `MediaCarousel`, `VideoMedia`, `PremiumPreview`), `CommentsSheet`, `MediaViewer`, post detail page.
4. Pages: Login → Onboarding → Home → Creator Profile → Collection/Following/Subscriptions → Discover → Wallet → Earnings/Payout accounts → Settings → Create/Edit post → Edit profile.
5. Replace mock data (`POSTS`, `CREATORS`, `ROLES` in Home.dc.html) with API calls; enforce entitlement on the server.
