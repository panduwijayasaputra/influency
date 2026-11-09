# US-059: Post Media Order & 5-Item Limit API

**Status:** ready_for_uat
**Priority:** medium
**Feature:** creator-studio

## Description

As an approved creator, I want my media to appear in the order I set and the 5-item limit to be enforced, so that my post looks the way I arranged it.

## Acceptance Criteria

- [ ] Each post's media has an explicit position. Existing media get positions from their current `createdAt` order (migration), and new uploads are appended at the end.
- [ ] `PUT /creators/me/posts/:postId/media/order` (session + CSRF) takes the full list of the post's media ids. Missing, extra, duplicate or foreign ids → 400. It only works on my own posts (others → 404) and in statuses where media can change.
- [ ] Requesting an upload when the post already has 5 non-deleted media → 409 with a clear error code, also under concurrent requests (no 6th item).
- [ ] Studio, public, feed, detail and viewer responses return media in position order. Premium entitlement rules and the cover rules are unchanged.
- [ ] The US-054 form uses this endpoint instead of the dummy order. Integration tests cover reorder, validation, isolation, the limit and the concurrent-upload case.

## Tasks

### TASK-207: Media position column, 5-item limit, ordered reads
**Status:** done

### TASK-208: Reorder endpoint + web wiring
**Status:** done
