# US-047: Archive & Restore a Post

**Status:** ready_for_uat
**Priority:** high
**Feature:** creator-content
**Revises:** US-019 "hide" — the existing `HIDDEN` status becomes "archived" (Monetization Spec v1 §2, §4, §4.1)

## Description

As an approved creator, I want to archive a published post and restore it later, so that I can take it off my page without breaking access for people who already paid.

## Acceptance Criteria

- [ ] A creator can archive their own published post; it disappears from the public page and feed and can no longer be newly unlocked
- [ ] Every archive is recorded as an archive episode with its timestamp; restoring closes the episode; archiving again opens a new episode. Episodes are never edited or deleted
- [ ] A creator can restore an archived post; it returns to the public page as published
- [ ] Archiving never deletes the post or its media
- [ ] The studio shows "Arsipkan" / "Pulihkan" instead of hide/show, and the creator sees the archived state in their post list
- [ ] Who keeps access to an archived post is decided by US-050; until purchases exist, an archived post is visible only to its owner

## Tasks

### TASK-060: Archive & restore — shared contract, migration and API
**Status:** done

### TASK-061: Studio — Arsipkan / Pulihkan and archived state
**Status:** done
