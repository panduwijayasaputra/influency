# US-041: Diikuti Page UI

**Status:** ready_for_uat
**Priority:** medium
**Feature:** user-area

## Description

As a signed-in user, I want a list of the creators I follow, so that I can jump to their profiles and manage who I follow.

## Acceptance Criteria

- [x] `/following` shows **Diikuti**, a count ("12 creator"), a sort (Terakhir diikuti / Nama A–Z) and a Grid / Vertikal view toggle.
- [x] Each creator card shows cover, avatar, name, @username and a 2-line bio, and opens the creator profile. Following here never implies a subscription, and the page copy says so.
- [x] Cards have no unfollow action (per the design). Following is toggled on the creator profile, and the list refetches on every visit so it always matches.
- [x] Empty state: "Kamu belum mengikuti siapa pun" with a **Jelajahi** button to `/discover`. Loading skeleton and retryable error exist. Guests go to login with `returnTo=/following`.
- [x] Data comes from one swappable source (dummy data now). Component tests cover sort, view toggle, empty, error and guest. The stub is removed.

## Tasks

### TASK-174: Following schema and dummy `fetchFollowingPage`
**Status:** done

### TASK-175: `FollowingView` and the `/following` page
**Status:** done
