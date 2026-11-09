# US-046: Following List API

**Status:** ready_for_uat
**Priority:** medium
**Feature:** user-area

## Description

As a signed-in user, I want the list of creators I follow from the server, so that Diikuti always matches what I follow.

## Acceptance Criteria

- [x] `GET /me/following` returns the caller's followed creators with slug, display name, avatar, cover and bio. Only approved, active creators are listed; suspended or removed ones are skipped. Guests get 401, and one user never sees another's follows.
- [x] `sort` supports `recent` (latest follow first) and `name` (A–Z, case-insensitive). The list is cursor-paginated and the response includes the total count.
- [x] Creator profile response data is reused, so no field outside the public creator shape is exposed (no follower identities, no earnings).
- [x] The Diikuti UI replaces the dummy data with this endpoint. A follow or unfollow made on a creator profile shows in the list and count on the next visit (the cards have no unfollow action).
- [x] Integration tests cover sorting, pagination, the exclusion of unavailable creators, the count and isolation between users.

## Tasks

### TASK-186: `GET /me/following` (service, cursor, controller, tests)
**Status:** done

### TASK-187: Swap the Diikuti UI to the real API
**Status:** done
