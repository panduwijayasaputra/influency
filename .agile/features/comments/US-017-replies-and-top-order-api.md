# US-017: Replies and Top Order API

**Status:** ready_for_uat
**Priority:** high
**Feature:** comments

## Description

As a viewer, I want to reply to comments and see the best comments first, so that conversations stay together and the useful ones surface.

## Acceptance Criteria

- [x] A comment can be created as a reply to a top-level comment on the same post.
  - A reply to a reply is attached to that reply's top-level parent (one level).
  - Replying to a deleted or missing comment, or to a comment on another post, is rejected with a domain error.
- [x] **Order:**
  - Top-level comments come in Top order: like count descending, then newest first. This is the documented placeholder from feature.md, kept in one swappable place.
  - The order is stable across cursor pagination.
  - Replies are listed oldest first under their parent.
- [x] **Deleted parents:**
  - A deleted parent with at least one live reply is returned as a placeholder with no body, author or avatar (CMT-08).
  - A deleted parent with no live replies is omitted (CMT-09).
  - Deleted text never appears in any response.
- [x] The post access rule applies to reading and writing replies exactly as to comments (CMT-03, CMT-13).
  - A locked premium post returns no comments or replies to anyone but the owner and admins, unless the policy flag allows it.
  - A guest can read the comments of a free post but cannot post.
- [x] Each comment carries the permission flags US-016 needs: `canEdit`, `canDelete`, `canPin`. The sheet's Balas action is wired to this API, and integration tests cover all the rules above.

## Tasks

### TASK-116: Shared contracts (create-with-parent, replies page, opaque cursor, constants)
**Status:** done

### TASK-117: Migration — parent_id and like_count
**Status:** done

### TASK-118: Service — Top order list, placeholders, flags, reply creation
**Status:** done

### TASK-119: Replies endpoint
**Status:** done

### TASK-120: Web — wire Balas, more replies, new cursor
**Status:** done
