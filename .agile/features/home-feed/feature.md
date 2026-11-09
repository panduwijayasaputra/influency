# Feature: Home Feed

**Slug:** home-feed
**Handoff phase:** Phase 3 (content, media and entitlement: the signed-in discovery surface). Feature #4 in [roadmap.md](../../roadmap.md).

## Overview

This feature turns the Beranda placeholder into the real Home:

- one **mixed "For You" feed** of PostCards from approved creators (no For You / Following tabs)
- a **"Creator untukmu"** block after the 5th post (pages of 3 full-width cards you can swipe or drag)
- a working **Ikuti** (follow) button on the creator profile and on the recommendation cards, plus a follower count in the profile stats row

Per the roadmap, the UI stories (US-022 and US-023) come first. They use dummy data from one swappable source. The backend stories (US-024 to US-026) then replace that data, and each one wires its part into the UI.

## Sources

- [design/HANDOFF.md](../../../design/HANDOFF.md), "Changes since the brief":
  - Home is one feed with no tabs. This supersedes UX spec §5 (HOME-01 and HOME-02).
  - "Recommended creators" sits after the 5th post.
  - Home is for signed-in users only.
- [INFLUENCY_MOBILE_FIRST_UI_UX_SPEC_v1.0.md](../../.docs/INFLUENCY_MOBILE_FIRST_UI_UX_SPEC_v1.0.md):
  - §5.1: infinite scroll, the same PostCard everywhere, a feed ranking that is not locked.
  - §5.2 (LOCKED): Follow is a free social relation and Subscribe is a paid entitlement. They are never merged.
  - §8.2: muted autoplay in the feed.
- Artboard (reference only, never copied into the app): the Home feed and recommended-creators states in [Home.dc.html](../../../design/artboards/Home.dc.html).

## Decisions

- **Feed contents (user decision, 2026-11-07): mixed For You.** The feed has published posts from every approved creator except the viewer's own. Following does not filter the feed.
- **Feed ranking is OPEN** (UX spec §5.1, §11 item 6). The placeholder is newest first and lives in one documented, swappable place. It is never presented as final policy. Whether and how much a follow boosts a post is also OPEN.
- **Recommendation ranking is OPEN.** The placeholder is follower count descending, then newest creator first, in one swappable place.
- **Follow ≠ Subscribe.**
  - Following never grants access.
  - Unfollowing never touches a subscription.
  - Subscribing does not follow automatically (UX spec §11 item 15 is open, so nothing is assumed).
- **Premium posts in the feed** follow the same entitlement rule as the creator profile. A locked post shows only the server-blurred preview, and the original media never appears in HTML or JSON.

## Open points

- Feed ranking formula and follow weighting (above).
- Recommendation ranking formula (above).
- Whether subscribing should also follow.
- The comment in `apps/web/src/app/(public)/[creatorSlug]/profile-actions.tsx` says plan values stay dummy "until US-026". That ID came from the old backlog. US-026 is now Recommended Creators API. Update the comment when US-024 touches that file.

## Stories

| ID | Title | Priority |
|---|---|---|
| US-022 | Home Feed UI | high |
| US-023 | "Creator untukmu" Block | high |
| US-024 | Follow API | high |
| US-025 | Home Feed API | high |
| US-026 | Recommended Creators API | medium |
