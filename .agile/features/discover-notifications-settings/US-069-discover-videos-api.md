# US-069: Discover Videos API

**Status:** ready_for_uat
**Priority:** high
**Feature:** discover-notifications-settings

## Description

As a visitor or logged-in user, I want the Jelajahi video feed to show real creator videos, so that discovery leads to real profiles.

## Acceptance Criteria

- [ ] `GET /discover/videos?cursor=` (public; session optional) returns published posts that are **free** and have a READY video, from approved creators, newest first, with cursor pagination (same page-size convention as other feeds). An invalid cursor → 400.
- [ ] Each item: post id, creator slug/name/avatar/follower count, caption, duration and the viewer's follow state (false for guests). Playback uses the existing media access flow (server-side entitlement check, short-lived URL); no provider `videoUid` or permanent URL is returned.
- [ ] Premium, draft, archived and moderation-hidden posts, and posts of unapproved/suspended creators, never appear. A logged-in viewer's own posts are excluded.
- [ ] Rate limited like other public read endpoints. US-065 uses this endpoint instead of dummy data.
- [ ] Integration tests cover the inclusion/exclusion rules, pagination stability, guest vs logged-in follow state, and that no premium post or media reference is returned.

## Tasks

### TASK-225: Discover videos endpoint + web wiring
**Status:** done
