# US-057: Muted Autoplay Video

**Status:** backlog
**Priority:** medium
**Feature:** mobile-first-ui

## Description

As a viewer, I want videos I may watch to start playing quietly as I scroll, so that browsing feels alive without surprising sound.

## Acceptance Criteria

- [ ] Free videos and premium videos with a valid entitlement autoplay **muted** with `playsinline`, only when they are the active carousel slide and sufficiently visible in the viewport.
- [ ] Locked premium videos never autoplay and never load a playable source. They show only the safe preview.
- [ ] At most one video plays at a time across the page. A video pauses when it scrolls off screen, when the slide changes, when the tab goes to the background, and when the Comments sheet, a purchase sheet, the drawer or the full-screen viewer opens over it.
- [ ] If the browser blocks autoplay, a tap-to-play control appears. A mute/unmute control is available on playing videos.
- [ ] The "Putar video otomatis" setting (US-075) turns autoplay off, which leaves tap-to-play only. Off-screen cards do not preload full video.
