# US-020: Pin Comment API

**Status:** ready_for_uat
**Priority:** medium
**Feature:** comments

## Description

As a creator, I want to pin one comment on my post, so that the most important comment is always seen first.

## Acceptance Criteria

- [ ] Only the post's creator can pin or unpin, and only a live top-level comment on that post. Pinning a reply, a deleted comment, or a comment on another post is rejected (CMT-10).
- [ ] At most one pinned comment per post, enforced by a database unique constraint:
  - pinning another comment replaces the previous pin atomically
  - pin and unpin are idempotent
  - concurrent pins never leave two pins (CMT-14)
- [ ] The pinned comment comes first in the list and does not appear again in its normal position (CMT-11).
- [ ] Deleting the pinned comment clears the pin in the same transaction (CMT-12).
- [ ] The sheet's Sematkan / Lepas sematan action is wired to this API, and integration tests cover all the rules above.

## Tasks

### TASK-127: pinned_at column, partial unique index, shared schema, delete clears the pin
**Status:** done

### TASK-128: Pin / unpin endpoints (service, controller, integration tests)
**Status:** done

### TASK-129: Pinned comment first in the list
**Status:** done

### TASK-130: Wire the sheet's Sematkan / Lepas sematan action
**Status:** done
