# US-018: Comment Likes API

**Status:** ready_for_uat
**Priority:** high
**Feature:** comments

## Description

As a viewer, I want to like and unlike comments and replies, so that I can show support and help good comments rise.

## Acceptance Criteria

- [ ] A signed-in user can like and unlike any live comment or reply on a post they can access.
  - At most one like per user per comment, enforced by a unique constraint.
  - Like and unlike are idempotent.
  - Concurrent likes never create duplicates (CMT-04, CMT-14).
- [ ] Every comment in the list returns its like count and whether the viewer liked it.
- [ ] A deleted comment cannot receive new likes. Live replies under a deleted parent can still be liked.
- [ ] Liking requires the same access as reading. On a locked premium post the request is rejected without revealing whether the comment exists. Guests get an auth error.
- [ ] The sheet's like heart is wired to this API, and integration tests cover the rules above, including the concurrent-like case.

## Tasks

### TASK-121: comment_likes table (Prisma model + migration)
**Status:** done

### TASK-122: Like / unlike endpoints (service, controller, integration tests)
**Status:** done

### TASK-123: Return `liked` for the viewer in comment responses
**Status:** done
