# US-024: Follow API

**Status:** ready_for_uat
**Priority:** high
**Feature:** home-feed

## Description

As a signed-in user, I want to follow and unfollow creators, so that I can keep track of the creators I like and they can see how many people follow them.

## Acceptance Criteria

- [x] **Follow and unfollow:**
  - A signed-in user can follow and unfollow an approved creator.
  - Both actions are idempotent. Following twice keeps one follow, and unfollowing someone you don't follow succeeds with no change. A DB unique constraint on (user, creator) backs this.
  - Guests get 401.
- [x] **Rejections and limits:**
  - Following your own creator profile is rejected with a domain error.
  - Following an unknown or unapproved creator is also rejected with a domain error.
  - The endpoints are rate limited.
- [x] **The public creator profile response includes:**
  - the follower count (counted over approved, active users)
  - for a signed-in viewer, whether they follow that creator
  - The stats row shows the follower count with an Indonesian label (e.g. "1,2 rb pengikut"), and the Ikuti/Diikuti button starts in the server state.
- [x] **The Ikuti buttons are wired to this API:**
  - On the creator profile and on the "Creator untukmu" cards, the toggle is optimistic and rolls back with an error toast if the request fails.
  - Unfollowing shows "Berhenti mengikuti. Langganan tidak terpengaruh."
  - The "Segera hadir" toast is removed.
- [x] Follow never grants or revokes any entitlement or subscription (UX spec §5.2). Integration tests cover all the rules above, including that following a creator does not unlock their premium posts.

## Tasks

### TASK-138: Shared follow contract and migration
**Status:** done

### TASK-139: Follow service and endpoints
**Status:** done

### TASK-140: Web: wire Ikuti, follower count and the unfollow toast
**Status:** done
