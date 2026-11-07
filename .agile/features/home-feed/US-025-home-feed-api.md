# US-025: Home Feed API

**Status:** ready_for_uat
**Priority:** high
**Feature:** home-feed

## Description

As a signed-in user, I want the Home feed to show real posts, so that what I see on Beranda is what creators actually published.

## Acceptance Criteria

- [x] **The feed endpoint:**
  - It is for signed-in users only (guests get 401) and uses cursor pagination.
  - It returns published, non-removed posts from approved creators, excluding the viewer's own posts.
  - It uses the same post shape as the creator profile feed.
- [x] **Order:**
  - Posts come newest first. This is the placeholder from feature.md, kept in one swappable place.
  - The order is stable across pages: no duplicates and no gaps when posts are published between page loads.
- [x] **Entitlement** is checked on the server with server time (handoff §6.4), exactly as on the creator profile:
  - A locked premium post carries only the safe preview and price.
  - Original media and signed URLs never appear in the response for a viewer without access.
- [x] Hidden or moderated posts, posts from suspended or unapproved creators, and drafts never appear.
- [x] The Home UI reads this API instead of the dummy source. Integration tests cover ordering, pagination, own-post exclusion, the visibility rules and the premium leak rule.

## Tasks

### TASK-141: Feed endpoint
**Status:** done

### TASK-142: Web: read the feed API
**Status:** done
