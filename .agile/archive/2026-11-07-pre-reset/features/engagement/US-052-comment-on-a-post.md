# US-052: Comment on a Post

**Status:** ready_for_uat
**Priority:** medium
**Feature:** engagement
**Depends on:** US-020. Reporting comments ties into US-042.

## Description

As a logged-in user, I want to comment on a post, so that I can talk with the creator and other fans.

## Acceptance Criteria

- [ ] A logged-in user can comment on a published free post; text only, with a configured maximum length
- [ ] Who can comment on, and who can read comments of, premium posts is TBD; configurable policies default to "only viewers with access" for both
- [ ] A commenter can delete their own comment; the creator can delete any comment on their own posts; deleted comments disappear for everyone
- [ ] Comments on archived or removed posts are not shown publicly and new comments are rejected
- [ ] Comment text is rendered as plain text (no HTML/script injection)

## Tasks

### TASK-084: Post comments — table, env flags and shared contract
**Status:** done

### TASK-085: Comments API — list, create, delete with access and rate-limit rules
**Status:** done

### TASK-086: Comments section on the post page
**Status:** done
