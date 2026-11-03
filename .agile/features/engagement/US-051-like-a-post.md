# US-051: Like a Post

**Status:** ready_for_uat
**Priority:** medium
**Feature:** engagement
**Depends on:** US-020

## Description

As a logged-in user, I want to like a post, so that I can show the creator I enjoy their content.

## Acceptance Criteria

- [x] A logged-in user can like and unlike a published post they are allowed to view; at most one like per user per post, even under repeated or simultaneous requests
- [x] Logged-out visitors see the like count and are sent to login (returning to the same post) when they try to like
- [x] Like counts appear on published posts; archived, draft and removed posts accept no likes
- [x] Whether premium posts can be liked without access is TBD; a configurable policy defaults to "only viewers with access"

## Tasks

### TASK-081: Post likes — table, env flag and shared contract
**Status:** done

### TASK-082: Like / unlike API and like counts on public posts
**Status:** done

### TASK-083: Like button on the post page and counts on feed cards
**Status:** done
