# US-065: Jelajahi Video Tab UI

**Status:** ready_for_uat
**Priority:** high
**Feature:** discover-notifications-settings

## Description

As a visitor or logged-in user, I want to swipe through full-screen creator videos on Jelajahi, so that I can find new creators quickly.

## Acceptance Criteria

- [ ] `/discover` replaces `ComingSoon` with a "Video | Cari" tab bar; "Video" is the default tab. The bottom nav "Jelajahi" item is active.
- [ ] The Video tab is a full-height, vertical, snap-scrolling list (one video per screen, per artboard state `discover`). Only the video on screen plays, muted, using the existing `VideoMedia` autoplay rules; an unmute button and a play button (when paused) are shown.
- [ ] Each item shows creator avatar, name, follower count, caption (truncated) and an Ikuti/Diikuti button using the existing follow API. `/discover` stays login-only (app-shell rule), so a guest is sent to Login with `returnTo=/discover` by the proxy. No Ikuti button on the viewer's own videos.
- [ ] Tapping the avatar or name opens `/{creatorSlug}` and adds the creator to "Baru dilihat" (US-066).
- [ ] Data comes from one swappable source (dummy until US-069) with loading, empty ("Belum ada video") and error-with-retry states. Component tests cover tabs, single active player, follow and guest redirect.

## Tasks

### TASK-217: Discover videos contract + dummy source
**Status:** done

### TASK-218: Jelajahi page with tabs and video reels
**Status:** done
