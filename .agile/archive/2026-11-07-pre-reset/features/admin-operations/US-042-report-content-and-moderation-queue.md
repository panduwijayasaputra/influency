# US-042: Report Content & Moderation Queue

**Status:** ready_for_uat
**Priority:** medium
**Feature:** admin-operations

## Description

As a logged-in user, I want to report a post that breaks the rules, so that Influency can review and remove harmful content.

## Acceptance Criteria

- [x] A logged-in user can report a post with a reason
- [x] Admins see reported posts in a moderation queue and can dismiss, hide or remove them
- [x] Admins can suspend a creator or user
- [x] Moderation actions never change financial history

## Tasks

### TASK-087: Shared contracts, schema and migration for reports and moderation actions
**Status:** done

### TASK-088: Report a post — `POST /api/v1/posts/:id/report`
**Status:** done

### TASK-089: Admin moderation queue and post actions
**Status:** done

### TASK-090: Admin suspend / unsuspend a user or creator
**Status:** done

### TASK-091: Web — "Laporkan" on the post detail page
**Status:** done

### TASK-092: Web — `/admin/moderation` queue page + studio wording
**Status:** done
