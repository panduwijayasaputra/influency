# US-026: Recommended Creators API

**Status:** ready_for_uat
**Priority:** medium
**Feature:** home-feed

## Description

As a signed-in user, I want the "Creator untukmu" suggestions to be real creators I don't follow yet, so that following one actually adds someone new.

## Acceptance Criteria

- [x] **The endpoint:**
  - It is for signed-in users only (guests get 401).
  - It returns up to 15 approved creators that the viewer does not follow, never the viewer's own creator profile.
  - Each creator has public fields only: slug, name, avatar, cover and follower count.
- [x] Ranking is follower count descending, then newest creator first. This is the placeholder from feature.md, kept in one swappable place.
- [x] Suspended and unapproved creators never appear.
- [x] **Wiring:**
  - The "Creator untukmu" block reads this API instead of the dummy source.
  - Following a creator from a card keeps that card visible as "Diikuti" until the next load. The list is not reshuffled under the user's finger.
- [x] Integration tests cover the exclusions (self, followed, unapproved) and the ordering.

## Tasks

### TASK-143: Recommended creators endpoint
**Status:** done

### TASK-144: Web: read the recommendations API
**Status:** done
