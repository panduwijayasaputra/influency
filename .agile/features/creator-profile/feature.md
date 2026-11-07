# Feature: Creator Profile (Light Social)

**Slug:** creator-profile
**Handoff phase:** Phase 2 (public creator route) and Phase 3 (posts, media access), UI over existing APIs. Feature #2 in [roadmap.md](../../roadmap.md).

## Overview

This feature turns the creator page, the bio-link landing page, into the Light Social design:

- a reusable **PostCard** with a media carousel, muted video autoplay and a locked premium preview
- the new **profile header**
- **Postingan / Grid** tabs
- the restyled **post detail** page
- the **full-screen media viewer**

The UI uses existing APIs: the public profile and feed, post detail, media access, likes and comments. Actions that belong to later features are shown as designed and marked "Segera hadir" (see Decisions). Backend gaps are replaced by their own features later.

## Sources

- [design/HANDOFF.md](../../../design/HANDOFF.md): the profile header, PostCard actions and grid filters (section "Changes since the brief"), and the business rules.
- [design/artboards/Home.dc.html](../../../design/artboards/Home.dc.html): the creator profile (Posts/Grid), post detail and full-screen viewer states.
- [design/artboards/PostCard.dc.html](../../../design/artboards/PostCard.dc.html): carousel, video states, premium preview, action row and unlock CTA.
- [design/artboards/S03-Creator-BioLink.dc.html](../../../design/artboards/S03-Creator-BioLink.dc.html) and [S04-Creator-Grid.dc.html](../../../design/artboards/S04-Creator-Grid.dc.html).
- [INFLUENCY_MOBILE_FIRST_UI_UX_SPEC_v1.0.md](../../.docs/INFLUENCY_MOBILE_FIRST_UI_UX_SPEC_v1.0.md) §6.3: video playback, **LOCKED** Option B (muted autoplay).

The `.dc.html` files are reference only. Never copy them into the app.

## Decisions (with the user, 2026-11-07)

- **Actions from later features** are shown as designed and give a "Segera hadir" toast when tapped:
  - **Ikuti** (home-feed)
  - **Simpan** (user-area)
  - **Kirim Tip** (purchases)
  - Langganan and Buka keep opening the existing demo purchase sheet.
- **Dummy numbers** such as the follower count and the subscription days left are visibly marked as demo.
- **No Message button.** Messaging is out of MVP scope (handoff §2), so the header shows only Share next to @username.
- **Guest rules from US-007 still apply.** Guests see no top bar or bottom nav, and every action sends them to `/login` with `returnTo`. Opening posts and viewing free or unlocked media is allowed.
- **Premium originals never reach a viewer without access** (handoff §6.4). A locked post shows only the server-generated blurred preview, and media is fetched through the access-checked media endpoint.
- Copy is in Bahasa Indonesia ([roadmap.md](../../roadmap.md) labels: Postingan / Grid, Ikuti / Langganan / Berlangganan, Kirim Tip, Gratis / Premium).

## Open points

- **Media per post:** design/HANDOFF.md says max 5, but the code allows 10 (`POST_MEDIA_MAX_PER_POST`). The carousel shows whatever a post has. The limit itself is decided in creator-studio.
- **Like on a locked premium post** is OPEN in the UX spec. Keep today's behaviour (`PREMIUM_LIKES_WITHOUT_ACCESS`, off by default).

## Stories

| ID | Title | Priority |
|---|---|---|
| US-008 | PostCard with Media Carousel | high |
| US-009 | Muted Video Autoplay in PostCard | high |
| US-010 | Creator Profile Header | high |
| US-011 | Postingan and Grid Tabs | high |
| US-012 | Post Detail Page | medium |
| US-013 | Full-screen Media Viewer | medium |
