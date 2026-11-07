# US-019: Edit Comment API

**Status:** ready_for_uat
**Priority:** medium
**Feature:** comments

## Description

As a comment author, I want to edit my comment or reply at any time, so that I can fix mistakes.

## Acceptance Criteria

- [x] Only the author can edit the text of their own comment or reply, with no time limit, and the same validation as create (plain text, 500 characters) (CMT-05).
- [x] The creator or an admin cannot edit other people's comments; the request is rejected (CMT-06).
- [x] An edit records `editedAt`, and the list returns it so the UI shows "Diedit". A deleted comment cannot be edited.
- [x] On a premium post the author still needs current access to edit. If access has ended, the edit is rejected (CMT-13).
- [x] The sheet's Edit action is wired to this API, and integration tests cover author, non-author, creator, admin, deleted and lost-access cases.

## Tasks

### TASK-124: edited_at column and shared schemas
**Status:** done

### TASK-125: Edit endpoint (service, controller, integration tests)
**Status:** done

### TASK-126: Wire the sheet's Edit action
**Status:** done
