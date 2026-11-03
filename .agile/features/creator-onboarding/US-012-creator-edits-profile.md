# US-012: Creator Edits Profile

**Status:** ready_for_uat
**Priority:** medium
**Feature:** creator-onboarding

## Description

As an approved creator, I want to edit my display name, bio, avatar and banner, so that my public page represents me well.

## Acceptance Criteria

- [ ] An approved creator can update display name, bio, category, avatar and banner from the Studio
- [ ] Changes appear on the public creator page after saving
- [ ] A creator can only edit their own profile
- [ ] Avatar and banner uploads reject unsupported file types and oversized files

## Tasks

### TASK-035: Profile image columns, shared profile contracts and error codes
**Status:** done

### TASK-036: R2 object storage seam, env vars, image body parsing and error mapping
**Status:** done

### TASK-037: Profile edit and image API (`GET`/`PATCH /creators/me`, `PUT /creators/me/avatar|banner`, public image GET)
**Status:** done

### TASK-038: `/studio/profile` edit page
**Status:** done
