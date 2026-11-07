# INFLUENCY — CLAUDE DESIGN CONTEXT & EXECUTION BRIEF

**Version:** 1.0  
**Date:** 4 November 2026  
**Purpose:** Single-file, self-contained source of truth for designing Influency in Claude Design.  
**Output target:** A polished, consistent, mobile-first, app-like web product design / interactive prototype, **not** a native mobile app.  
**Language of this context:** English for reliable execution. Existing product labels are preserved exactly; other UX copy is provisional and should be localization-ready.

> **INSTRUCTIONS FOR CLAUDE DESIGN — READ FIRST**  
> You are the product design lead for **Influency**. Use this context to create a cohesive, high-fidelity mobile-first web interface, optionally as an interactive prototype if your environment supports it. **Do not redesign the product requirements or change decisions marked LOCKED.** Prioritize visual and interaction quality, realistic information architecture, reusable components, and believable mobile behavior. Where something is **OPEN**, use a modest temporary design assumption and clearly label it `PROPOSAL`, or leave it as a placeholder. Do not claim an unconfirmed assumption is product policy. Avoid generic marketing landing pages, irrelevant dashboards, and invented premium features. Focus on the actual logged-in/guest application experience described here.

---

## 1. Product Context

### 1.1 What Influency is

Influency is a **web-first, multi-creator social and premium content platform**. Creators publish posts containing images and/or videos. Viewers discover creators, follow them, interact with posts, purchase premium post access with prepaid **Koin**, subscribe to creators, and tip eligible creators.

The product is typically accessed through direct profile URLs shared in a creator's Instagram/TikTok bio, including mobile in-app browsers. It must also work as a standalone web destination. It should **look and feel like a refined native social application**, without being a Telegram Mini App or requiring app installation.

Key entities:
- **User / viewer**: can browse public content, follow creators, collect liked and purchased posts, and pay for premium content.
- **Creator**: also a user; has their own creator profile, creates content, offers one subscription plan and receives earnings.
- **Platform admin**: manages trust/safety and financial workflows, but admin screens are **not** the visual design priority here.

### 1.2 Product objectives

1. Make creator identity and media the center of the experience.
2. Make browsing feel like a modern social application, not an e-commerce catalog.
3. Make premium access easy to understand, but never use deceptive paywalls or fake unlocked media.
4. Provide coherent UX across Home, Creator Profile, My Collection, Following, Wallet, and comments.
5. Keep mobile performance, safe areas, in-app browsers, and accessibility in mind.

### 1.3 LOCKED visual direction

**Light Social** — bright, welcoming, contemporary, approachable, content-first, warm coral as the signature accent. Social-app familiarity with a distinct Influency identity. Avoid dark-premium-only styling, overly glamorous/flashy crypto aesthetics, or corporate SaaS dashboards. Dark mode is not the primary visual direction.

---

## 2. Design Language — PROPOSED TOKENS (NOT LOCKED)

Use these as a consistent starting point. Improve spacing/contrast and component polish as needed, but do not change the Light Social direction.

| Token | Suggested value | Intent |
|---|---|---|
| `color.primary` | `#EF8176` | Warm coral for primary actions, active nav, selected tabs |
| `color.primary.soft` | `#FFE8E2` | Light coral surfaces, chips, highlights |
| `color.canvas` | `#FAFAFA` | Neutral application background |
| `color.surface` | `#FFFFFF` | Post cards, app bars, sheets |
| `color.text` | `#25262B` | High-legibility main text |
| `color.muted` | `#85858F` | Supporting labels / metadata |
| `color.border` | `#ECE8E7` | Fine, understated dividers |
| `color.koin` | `#D6A443` | Wallet / Koin accents, **not** a crypto identity |
| `color.danger` | Accessible red | Destructive actions / error state |
| Font | `Plus Jakarta Sans` or `Inter` | Clear, compact modern mobile readability |
| Base mobile artboard | `390 x 844` | Also test 320, 360, 375, 430px widths |
| Tap target | >= 44 x 44px | Touch accessibility |
| Primary action height | 48–52px | Easy thumb reach |
| Corners | 12–20px on cards/sheets | Friendly without cartoonish exaggeration |
| Desktop content column | ~480–560px for feed | Mobile-like content column on wider screens |

**Visual craft:** image/video-first layouts, restrained borders and shadows, comfortable rhythm, distinct typography hierarchy, polished empty states and skeletons, natural motion with reduced-motion fallback, responsive layout. Make premium thumbnails intentionally **safe blurred previews**, not real premium media leaked beneath CSS blur.

**Copywriting:** Preserve fixed labels such as **Home, Notification, Discover, Wallet, Profile, For You, Following, My Collection, Subscriptions, Posts, Grid, Top, Recent, All Media, Free, Premium**. Supporting copy can be in consistent English for the mockup and localization-ready; final locale has not been locked.

**Avoid:** giant headers, horizontal web dashboard nav on mobile, excessive gradients, excessive glassmorphism, crypto trading patterns, intrusive modal stacks, large fixed marketing banners, unnecessary follower counters or fake verification badges, and direct imitation of another brand's identity.

---

## 3. Decision Hierarchy

- **LOCKED:** product/interaction behavior explicitly selected by the founder. Treat as mandatory.
- **SPECIFIED:** founder-described requirement; treat as the primary design instruction unless it conflicts with a locked rule.
- **PROPOSAL:** sensible presentation choice that can be revised; do not portray as approved product policy.
- **OPEN:** still requires a product decision. You may mock up a reasonable option, but flag it clearly.

**If conflicts arise:** prioritize the latest explicit decision. In particular:
- Creator Profile is **Posts + Grid**, NOT social-feed-only.
- The bottom bar is **always visible on regular app screens, including external creator profile direct links**; do not hide it simply because the user came from Instagram/TikTok.
- Home default is always **For You**, NOT remember-last-tab.
- Premium comments are **private to valid entitlement holders**.

---

## 4. Information Architecture — LOCKED / SPECIFIED

### 4.1 Global mobile App Shell

Every ordinary Influency page uses:

**A. Top Navbar**
- Influency logo **left**; tapping it may route Home (PROPOSAL).
- Search / Discover icon **right**: navigates to Discover.
- Signed-in user's **initial/avatar icon right**: opens an account drawer from the **RIGHT**.
- **Specified scroll direction: HIDE when scrolling UP, SHOW when scrolling DOWN.** This is intentionally the literal founder instruction and is opposite the common mobile pattern. **Do not silently reverse it.** Surface as a usability-testing note if appropriate.

**B. Fixed Bottom Navigation — LOCKED**

Exactly five tabs, in this order:
1. **Home**
2. **Notification**
3. **Discover**
4. **Wallet**
5. **Profile**

- Persistently visible on all regular app pages **including direct creator bio-link entry**.
- Do not replace it with a different set of shortcuts on creator pages.
- Use icons + readable labels, visible active state, account for `safe-area-inset-bottom`.
- Standalone **Become a Creator onboarding** has **no App Shell** by explicit decision; a full-screen system overlay may cover the bar without changing the bar's page-level visibility rule.

**C. Right Account Sidebar / Drawer — SPECIFIED**

Vertical order:
1. Avatar + display name + username.
2. Wallet summary: Koin balance and prominent **Buy Koin** action.
3. **My Profile**.
4. **Become a Creator** (only if account is **not** a creator).
5. **My Collection**.
6. **Following**.
7. **Subscriptions**.
8. **Settings**.
9. **Logout**.

Make it a real right-side slide-in drawer with backdrop, close control, mobile-safe width, and sensible focus/keyboard behavior. Do not mistake the top avatar trigger for the bottom Profile destination.

### 4.2 Navigation semantics

- **Bottom Profile** and **Sidebar My Profile** both navigate **directly to the current user's own profile**.
- If the current user is a creator: their own **Creator Profile**.
- If not a creator: their own **User Profile**.
- **Top initial** opens right drawer; it does NOT navigate to profile.
- **Top Search** and **Bottom Discover** go to the Discover page.
- **Sidebar wallet / Buy Koin** and **Bottom Wallet** lead to wallet or top-up as appropriate.
- Following is a **free social relationship**, distinct from a paid Subscription.

### 4.3 Suggested route names — PROPOSAL, not final contract

`/` Home, `/notifications`, `/discover`, `/wallet`, `/me`, `/collection`, `/following`, `/subscriptions`, `/creator/onboarding`, `/:username` creator public profile. Use routing only if your design environment supports it.

---

## 5. Screen Inventory & Design Scope

Design a coherent set of mobile-first screens and component states, in this **priority order**:

| Priority | Screen / state | Design deliverable |
|---|---|---|
| P0 | Home — **For You** | Feed with free post, multi-media carousel, accessible video, locked premium post |
| P0 | Home — **Following** | Same post system, from followed creators; empty state |
| P0 | Creator Profile — **Posts** | Cover/avatar/header, subscription CTA as appropriate, full vertical feed |
| P0 | Creator Profile — **Grid** | Thumbnail media grid; two groups of filters |
| P0 | Comments Bottom Sheet — entitled | Top / Recent, reply, like, edit, delete, pin states |
| P0 | Comments Bottom Sheet — premium locked | Locked view; no comment body or user preview |
| P0 | Right Account Sidebar | All account entries; wallet summary; role-sensitive creator onboarding |
| P0 | Main App Shell | Top navbar and always-visible bottom nav across pages |
| P1 | My Profile — creator owner | Creator profile with **Edit Profile**, own-post contextual actions |
| P1 | My Profile — non-creator | Shared profile header; lower content region **OPEN**; don't invent a social feed |
| P1 | My Collection | Liked + Purchased; filters, sort, Grid / Vertical |
| P1 | Following directory | Creator cards + sort + Grid / Vertical |
| P1 | Subscriptions | Simpler creator list, no sort / display toggle |
| P1 | Discover | Creator exploration/search; detailed recommendation UI **OPEN** |
| P1 | Wallet | Koin balance + Buy Koin; detailed checkout **OPEN** |
| P2 | Notification | Clear list/skeleton/empty states; detailed notification policies **OPEN** |
| P2 | Become a Creator | **Standalone**, no App Shell, high-quality onboarding shell; steps **OPEN** |
| Deferred | Settings | Entry exists but detailed screen deferred |

**Deliver a system, not one isolated hero mockup.** Ensure repeated controls are visually and behaviorally consistent.

---

## 6. Home Feed — LOCKED

Home has **exactly two tabs** under the top bar:
- **For You:** content recommendations from various creators.
- **Following:** content from creators the user follows.

**Always open For You as the default when Home is entered/re-entered.** User can manually choose Following during the visit. Do not store and restore Following as default for a new Home navigation.

Both tabs display a **vertical feed** of reusable Post Cards. Use realistic staggered card lengths, creator diversity, mixed image/video posts, a subtle premium preview, and sensible whitespace. Do not turn Home into a full-screen vertical TikTok-style player or an unrelated grid.

**PROPOSAL:** Following may be newest-first; For You could mix recency, engagement, and creator variety. The exact recommendation/ranking algorithm is **OPEN**. Empty Following state should invite browsing Discover. Guest may browse public/safe previews, but writes/Wallet actions need authentication (detailed guest policy still OPEN).

---

## 7. Creator Profile — LOCKED / SPECIFIED

### 7.1 Shared profile header

For both creator and non-creator profile:
- **Cover image**.
- **Avatar**.
- **Display name**.
- **Username**.
- On **own profile only**: **Edit Profile** button.

For a **visitor viewing a creator profile**, show role-appropriate **Subscribe** and other legitimate CTA states; never show Edit Profile. Do not automatically show a Send Tip CTA to an ineligible viewer. No invented verification badges or follower counts.

### 7.2 Creator Profile content tabs — LOCKED

Exactly two tabs:
1. **Posts**
2. **Grid**

**Posts**:
- One-column, vertically stacked full post cards.
- Each post displays date/time, caption, media carousel.
- Multiple photos / mixed media: horizontally swipeable carousel with **right peek/right-offset next slide**, indicating more media.
- Engagement row: **Like, Comment, Share on LEFT**, **Send Tip on RIGHT** *only if eligible*. For locked premium posts, show safe premium preview and Unlock CTA.

**Grid**:
- All photo and video media as **individual thumbnails**, **no captions**.
- Two independent filter groups:
  - **Media Type:** `All` / `Image` / `Video`.
  - **Access Type:** `All Media` / `Free` / `Premium`.
- Filters compose, e.g. `Video + Premium`.
- **PROPOSAL:** 3-column compact square thumbnails, tiny gaps, video play badge and premium lock badge; each media item maps back to its original post, respecting post-level entitlement.
- **OPEN:** tapping a grid tile opens a full-screen viewer vs post detail. Do not silently fix this as product policy.

### 7.3 Own creator profile versus public profile

Use the **same underlying layout**. Swap role-aware actions:
- Owner sees Edit Profile and post management menu (Edit/Archive proposed, detailed workflows OPEN).
- Visitor sees Subscribe / Follow when appropriate; these relationships are distinct.
- Creator must not tip their own content.

Non-creator **user profile** currently only has the defined header; anything below it is **OPEN**. Render a restrained placeholder rather than inventing activity, badges, or purchases visible to others.

---

## 8. Reusable Post Card — LOCKED STRUCTURE

Compose once, reuse in Home For You, Home Following, Creator Profile Posts, and My Collection Vertical.

```text
PostCard
├── Creator Header
│   ├── Avatar / clickable creator identity
│   ├── Name, username, post date
│   └── Contextual more menu, optional Follow in discovery
├── Caption
├── Horizontal Media Carousel
│   ├── photos/videos with original viewing aspect ratio
│   ├── right-peek on multi-media posts
│   ├── active slide / pagination affordance
│   └── entitlement-aware safe rendering
├── Engagement Row
│   ├── LEFT: Like · Comment · Share
│   └── RIGHT: Send Tip (premium accessible + eligibility only)
└── Unlock CTA when premium locked
```

**Single post / many media:** multiple carousel items are part of the same post, not separate posts. **PROPOSAL:** one purchased post unlocks all its media; this fits the current monetization model but media-count/content-model rules are still OPEN.

### 8.1 Media states

1. **Free:** original authorized media visible.
2. **Premium Locked:** safe **server-produced blurred preview** only; the original file/stream is not sent; explicit Unlock CTA.
3. **Premium Unlocked:** original accessible media and interactions after entitlement validation.

Archive/takedown can supersede access. A like **does not** give paid entitlement.

### 8.2 Video playback — LOCKED: Option B

- **Free video:** MUTED AUTOPLAY when active and sufficiently visible.
- **Premium video with valid entitlement:** MUTED AUTOPLAY when active and sufficiently visible.
- **Premium locked video:** NEVER autoplay, use safe preview only.
- Only the **active video carousel slide** may autoplay.
- At most **one autoplay video globally**.
- Pause offscreen, on slide change, background tab, or whenever Comments Bottom Sheet overlays the feed.
- Use `muted`, `playsinline`, viewport observation, lazy loading, and **tap-to-play fallback** where autoplay is blocked.
- Unmute control can be proposed; browser permissions and audio UX must remain reasonable.

### 8.3 Engagement

- **Like:** toggle state; login for mutations. **OPEN** whether locked premium posts can be liked by non-entitled users.
- **Comment:** always opens a **Bottom Sheet**, never a forced Post Detail route.
- **Share:** share a URL to the *post*, not a protected premium media URL. Native share with copy-link fallback is a PROPOSAL.
- **Send Tip:** only on premium posts currently accessible to the viewer, and only when eligible for that creator. **Do not show on free posts.**
- **Unlock:** purchase action for premium locked post; checkout design OPEN.
- **More menu:** viewer report/copy link and owner edit/archive can be shown as proposals. Moderation on comments is fully specified separately.

---

## 9. Comments Bottom Sheet — CORE UX LOCKED

### 9.1 Sheet layout

Tapping Comment on a Post Card:
- Opens **Comments Bottom Sheet** over the same feed.
- Feed remains mounted; scroll position is preserved.
- Video behind sheet pauses.
- Recommended layout: drag handle, **Comments** title/count, `Top | Recent` segmented sort, scrollable discussion list, sticky composer near keyboard/safe area, Close button.
- Height/gestures are flexible for design polish; **do not navigate to a separate Post Detail page**.

### 9.2 Premium comments — LOCKED PRIVATE

Only a user with **valid entitlement** to a premium post may **READ** or **WRITE** its comments or replies, or like/comment-edit within it. Valid access may be from direct post purchase, active creator subscription on eligible posts, or a valid archived-access grant. Post owner / authorized admin have narrowly scoped moderation rights.

For a **locked premium post**, opening Comments shows a **paywall-style locked sheet**, not the comment list. No comment bodies, replies, user avatars, author names, or snippets should be disclosed to an unauthorized viewer. Do not fake the unauthorized state by rendering actual comments behind a blur.

**PROPOSAL for free posts:** visitors can read comments; login is needed to write, edit, reply, or like.

### 9.3 Comment sorting — LOCKED

- `Top` and `Recent` are the only sorting modes.
- `Top` is **default every time the sheet opens**.
- `Recent` sorts new comments first.
- Top ranking formula is OPEN; do not assert a specific production algorithm. In a prototype, use likes as an illustrative local proxy only, labeled as mock behavior.
- Pinned parent comment is above all other top-level comments in **both** sorts and appears **exactly once**.

### 9.4 Comment/reply actions — LOCKED

- Main comments and replies may be **Liked** and **Unliked**; display count and active heart state.
- Comment/reply **author** can **Edit Anytime**, with `Edited` label after edit. No edit-window timer. Other people, including creator/admin, cannot rewrite someone else's comment merely because they can moderate it.
- User can delete own comments and replies.
- Creator can delete **any** comments/replies under posts they own.
- Platform admin may moderate comments platform-wide.
- **Preserve Replies deletion:** deleted parent text is no longer exposed; show `Comment deleted` placeholder if valid replies remain. Retain those valid replies. If no valid replies remain, omit the deleted parent row. Deleted items cannot receive new likes or edits.
- Only the **post creator** can **Pin or Unpin**, max **ONE TOP-LEVEL** comment per post. Replies cannot be pinned.
- Pin persists above Top/Recent; deleting a pinned comment clears its pin.

**PROPOSAL interaction:** inline edit with Save/Cancel, destructive confirm, per-comment `···` role-aware menu, creator badge on own reply, one visual nesting level for replies, optimistic likes with failure rollback. Exact comment length, anti-spam policies, and retention periods are OPEN.

### 9.5 Comment menu by role

| Operation | Comment author | Creator who owns post | Admin | Other viewer |
|---|---|---|---|---|
| Read premium thread | Only with entitlement (or creator owner privilege) | Yes on own post | Authorized moderation access | Only with entitlement |
| Like / Reply | With login and access | With access | With valid access / role | With login and access |
| Edit content | Their own only | Their own only | Their own only | Their own only |
| Delete own comment | Yes | Yes | Yes | No |
| Delete others' comments | No | Yes on own post | Yes within moderation | No |
| Pin / Unpin parent | Only if also owner | Yes | Not automatically | No |

Never expose an unauthorized action as successful when no backend rule would allow it.

### 9.6 Comment states worth designing

1. Entitled user, `Top` active, **pinned comment** first.
2. Entitled user switches to `Recent` and pinned comment remains first.
3. Inline editing own comment → `Edited` label.
4. Liking/unliking a parent and a reply.
5. Creator `···` menu with Pin/Unpin, Reply, Remove.
6. Deleted parent with surviving visible replies.
7. Premium locked viewer → no conversation data, Unlock/Subscribe CTA.
8. Empty comments state and pending / failed post states.

---

## 10. Other User Area Screens — SPECIFIED

### 10.1 My Collection

Contains posts/media the user has **Liked** and posts individually **Purchased**.

Controls:
- Filter **Creator**.
- Filter **All / Liked / Purchased**.
- Filter media type **All Content / Image / Video**.
- **Sort** (choice OPEN).
- Display **Grid / Vertical**.

When one item is both liked and purchased, show it only once in All results (PROPOSAL). **A like never becomes entitlement**; premium media remains protected unless independently purchased/subscribed/otherwise entitled.

### 10.2 Following

List of **all followed creators**, with:
- **Sort**.
- **Grid / Vertical** display choice.
- Creator card containing **cover, avatar, display name, username, bio**.

Do not conflate Following with paid Subscriptions.

### 10.3 Subscriptions

List of subscribed creators, **simpler than Following**:
- **No sort control**.
- **No display mode control**.
- Creator identity and essential subscription state may be shown; exact card and renewal UX are OPEN.

### 10.4 Wallet

Balance in **Koin**, Buy Koin action, basic transaction visibility. Do not invent credit cards or crypto tokens as the value unit. Exact payment checkout and refund screens are OPEN.

### 10.5 Discover and Notification

These are fixed bottom-nav destinations. Create clear design placeholders / reasonable visual concepts, but do not invent locked behavior for discovery algorithms, notifications policies, or ranking.

### 10.6 Become a Creator

Standalone onboarding flow **without** top navbar, bottom bar, or account sidebar. Show only for non-creators. Actual steps/data collection/verification remain OPEN.

### 10.7 Settings

Menu entry is required, **detailed screen DEFERRED**.

---

## 11. Monetization Rules That UI MUST Respect — LOCKED PRODUCT CONTEXT

This section is summarized to prevent visually appealing but logically incorrect screens. It is **not** a mandate to build backend payment flows inside design tooling.

| Area | Locked rule |
|---|---|
| Currency | **1 Koin = Rp1,000** reference value; integer Koin |
| Top-up packages | **10 / 25 / 50 / 100 / 250 Koin**; users may top up more than once |
| Paid post price | Creator sets **5–1,000 Koin/post** |
| Paid post purchase | Individual post unlock is **non-expiring** while legally available |
| Creator subscription | **ONE package per creator**, **30 days**, **10–5,000 Koin** |
| Renewal | **Manual only**; one prepaid scheduled early renewal allowed; may be cancelled with 100% Koin return **before** next period starts |
| Tips | **1–1,000 Koin** per tip; tip is not a purchase or access grant |
| Tip eligibility | Viewer must have active subscription **OR** have bought at least one premium post of that **same** creator |
| Tip surface | Creator profile for eligible viewers; an **accessible premium post**; never a free post |
| Tip restrictions | No self-tipping; creator receives full tip amount before any separately disclosed actual payout fee |
| Archive | Archived premium posts leave public feed/grid, individual purchasers retain eligible Library access; eligible subscribers at archive moment retain access only until end of **current** subscription period |
| Unauthorized media | Original premium media must not be delivered to non-entitled viewers |
| Purchase integrity | Koin balance, entitlement, and successful payment must be backend-authoritative, not UI assumptions |

**Commission context:** platform fee 20% premium post, 15% subscription, 0% tips. The viewer normally sees the Koin purchase price, not creator settlement math. QRIS handling and payment-gateway compliance remain a production/legal concern; do not design arbitrary QRIS surcharges.

**Important constraint:** Max single top-up is 250 Koin but subscription can cost up to 5,000 Koin. **Do not resolve this by inventing a new top-up package.** The user may accumulate balance through multiple top-ups; checkout UX for high subscription prices is an **OPEN** design issue.

---

## 12. Guest, Role, Entitlement & Error States

Create believable states rather than assuming all demo users are fully entitled:

1. **Guest** entering public creator profile from bio link: sees creator content previews, app shell and bottom bar. Login-dependent actions are gated.
2. **Signed-in viewer, no paid entitlement:** can follow creator, view free media, see locked previews and purchase/subscribe CTA.
3. **Subscriber with current entitlement:** eligible premium media and comments are accessible.
4. **Permanent post purchaser:** purchased post remains accessible regardless of current subscription, subject to legal/takedown availability.
5. **Creator owner:** edit profile, own content operations, creator moderation; no self-tip.
6. **Premium locked comments:** paywall sheet only; never show or fetch conversations.
7. **Zero Koin or insufficient balance:** present clear top-up path, not false instant unlock.
8. **Offline, slow connection, empty content:** sensible skeletons, placeholders, retry.

The same account can be both viewer and creator. **My Profile** routes based on the account's creator role, while public creator URLs represent the viewed creator, not the current user.

---

## 13. Responsive & Interaction Requirements

### Mobile (primary)

- Design for **320–430px** widths and standard iOS/Android safe areas.
- Top bar + fixed bottom nav coexist with scrolling content.
- Bottom navigation is visible on direct-link creator pages.
- Carousel should hint at the next slide via right peek **only when multiple media**; don't show a useless sliver for single media.
- Sheets should work inside mobile in-app browsers, not rely on desktop-only keyboard or hover interactions.
- Avoid fixed visual elements that overlap content, safe areas, or the on-screen keyboard.
- Handle `100dvh` and mobile keyboard resizing; use accessible close/escape behavior.
- Comment sheet scroll must not move the feed behind it; preserve feed scroll position.
- Auto-play muted videos only when authorized and visible, one at a time; pause on overlays/background/slide change.

### Tablet/Desktop (secondary)

- Preserve the app-like content column rather than stretching cards to full desktop width.
- Side whitespace, optional secondary sidebar, or constrained feed is acceptable as a PROPOSAL.
- Keep the same information architecture; avoid arbitrary desktop-only premium features.

### Accessibility and performance

- Clear focus rings, aria-label equivalents for icon-only controls, sufficient contrast, reachable touch targets.
- Reduced motion support; avoid motion-dependent meaning.
- Graceful skeleton states; image lazy loading; thumbnail-first media.
- Disable unsafe autoplay / player when user is unauthorized.

---

## 14. Functional Prototype Behaviors — Build If Supported

Create working demonstration interactions with mock/local data; do not imply real payment or account transactions occur:

1. Tap bottom nav to switch between 5 core destinations; active state updates.
2. Tap top initial/avatar to open **right** drawer; close with X/backdrop.
3. Tap top search to open Discover.
4. Home tabs toggle **For You / Following**; Home entry resets to For You.
5. Creator profile tabs toggle **Posts / Grid**.
6. Grid toggles **All/Image/Video** and **All Media/Free/Premium**, with composed filters.
7. Carousel swipes horizontally with right peek; show slide progress.
8. Comment action opens sheet; `Top` selected by default on every opening.
9. Comments Top/Recent reorders parent comments; pinned parent stays first.
10. Like/unlike comments and replies; creator can pin/unpin one parent in role demo.
11. Author can edit own comment inline and see `Edited`; delete parent shows placeholder with surviving replies.
12. Locked premium comment state shows only Unlock/Subscribe affordance; no private comment data.
13. Post media states switch Free/Locked/Unlocked in a clearly marked **demo control**, not as an actual purchase.
14. A creator's own profile includes Edit Profile; visiting another creator does not.
15. Modal/drawer open does not reset feed scroll or active carousel unexpectedly.

**Mock data is permitted** for profiles, avatars, captions, dates, thumbnails, like counts, and wallet amounts. These are demo samples, not actual users, transactions, or protected media assets. Mock pricing must stay within allowed rules.

---

## 15. Open Questions — DO NOT SILENTLY LOCK

- Behavior when tapping a Grid thumbnail: full-screen media viewer vs Post Detail.
- Non-creator My Profile content below header.
- Guest login entry, authentication UX, and detailed Wallet/Top-up purchase flows.
- Full Discover search/recommendation experience and Notifications event design.
- Exact palette, typography, desktop adaptation, and spacing system.
- For You ranking formula and Following sort behavior.
- Whether a non-entitled user can Like a locked premium post.
- Media count limits, exact media crop rules, post editing/deleting, and full upload workflow.
- Comment nesting depth, Top ranking formula, character limit, report flow, moderation retention, pagination tuning.
- Premium Unlock Bottom Sheet and Send Tip Bottom Sheet details.
- Whether subscribe auto-follows a creator.
- Subscription list card details and creator onboarding steps.
- Top-navbar hide/show gesture direction deserves usability review; **current founder instruction remains hide on UP / show on DOWN**.

When drawing an OPEN feature, label it **Design proposal / Needs confirmation**; do not alter the locked structure to make it simpler.

---

## 16. Recommended Design Execution Plan

**Phase 1 — Foundation**
- Establish Light Social visual tokens, typography, surfaces, icon set, and spacing.
- Build polished mobile **App Shell**, right drawer and persistent five-tab bottom navigation.
- Show direct creator bio-link entry with exactly the same bottom bar.

**Phase 2 — Core Social Content**
- Build **one reusable Post Card** with images, video player state, right-peek carousel, engagement, premium preview, and tip eligibility states.
- Compose Home **For You** / **Following** from the Post Card.
- Compose Creator Profile **Posts** from the same card.

**Phase 3 — Creator & Collection Surfaces**
- Design Creator Profile **Grid** with both filters.
- Design My Profile for creator and non-creator (non-creator lower content remains a placeholder).
- Design My Collection and Following with grid/vertical variants, plus simpler Subscriptions.

**Phase 4 — Bottom Sheet and Permissions**
- Design Comments Bottom Sheet entitled, premium-locked, sorted, pinned, edited, deleted, reply and like states.
- Include clear interaction/state transitions and safeguards against private comment exposure.

**Phase 5 — Supporting Destinations**
- Conceptual Discover, Wallet, Notifications, and standalone Become a Creator onboarding without inventing policies.
- Document remaining decisions and handoff guidance.

**Expected presentation output:**
1. A **mobile screen collection** showing core flows with real UI hierarchy and mock media.
2. A **component mini-design system** with colors, type scale, spacing and component variants.
3. A **working clickable prototype** if supported by the environment, otherwise interaction annotations.
4. A list of **LOCKED vs PROPOSAL vs OPEN** design decisions.
5. An **implementation-ready component map**: `AppShell`, `TopNavbar`, `BottomNavigation`, `AccountDrawer`, `FeedTabs`, `PostCard`, `MediaCarousel`, `VideoMedia`, `PremiumPreview`, `CreatorProfileHeader`, `CreatorProfileTabs`, `MediaGrid`, `FilterSegmentedControl`, `CommentsBottomSheet`, `CommentThread`, `CommentComposer`, `MyCollection`, `CreatorCard`, `WalletSummary`.

---

## 17. Completion Checklist

- [ ] Light Social aesthetic, warm coral accent, sophisticated creator-media-first look.
- [ ] Top navbar: logo left; search and user initial right; user initial opens **right drawer**.
- [ ] Navbar hide-on-UP/show-on-DOWN preserved literally (or flagged for review, not reversed).
- [ ] Five fixed bottom tabs, correct order, including creator bio-link entry.
- [ ] Right drawer includes profile, wallet/top-up, conditional Become a Creator, collection, following, subscriptions, settings and logout.
- [ ] Home has For You and Following; For You selected whenever entering Home.
- [ ] Creator Profile has cover/avatar/name/username and Posts + Grid tabs.
- [ ] Posts are vertical, with caption/date/right-peek carousel and Like/Comment/Share left, conditional Tip right.
- [ ] Grid has both independent media filters and **no captions**.
- [ ] Free + unlocked premium video muted autoplay when active/visible; locked premium never autoplay.
- [ ] Comments open as bottom sheet; feed position retained; Top default / Recent available.
- [ ] Premium locked comment sheet reveals no comment/reply data.
- [ ] Comment and reply likes, author's edit-anytime + Edited, author/creator/admin deletion.
- [ ] Deleted parent shows placeholder and preserves valid replies.
- [ ] Creator can pin only one top-level comment; it stays on top in both sorts.
- [ ] My Collection filters + sort + grid/vertical; Following creator cards + sort + grid/vertical; Subscriptions simpler without those controls.
- [ ] Creator onboarding is standalone; Settings details deferred.
- [ ] No invented subscriptions tiers, coin packages, hidden premium media, or new locked behaviors.
- [ ] Product ambiguities visibly flagged as PROPOSAL or OPEN.

---

## 18. Kickoff Command (Optional — paste with this file in Claude Design)

> Design **Influency** using the attached `INFLUENCY_CLAUDE_DESIGN_CONTEXT_v1.0.md` as your authoritative product UX brief. Start by implementing a cohesive, mobile-first, high-fidelity **Light Social** application design (390px baseline) with the App Shell, Home (For You + Following), Creator Profile (Posts + Grid), reusable Post Cards, right-side account drawer, and Comments Bottom Sheet. Preserve **all LOCKED requirements** precisely. Use polished mock creator media and interaction states; do not invent unapproved product mechanics. Then extend the same design system to My Collection, Following, Subscriptions, Wallet, Discover, Notification, My Profile and standalone creator onboarding. Create real clickable interactions where possible. Explicitly separate design proposals from established decisions, and prioritize a coherent, production-ready component system over isolated screenshots.

**End of Claude Design context.**
