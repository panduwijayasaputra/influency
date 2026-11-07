# US-016: Upload Images to Private Storage

**Status:** ready_for_uat
**Priority:** high
**Feature:** creator-content

## Description

As an approved creator, I want to upload images to my posts, so that my content is stored safely and not publicly reachable.

## Acceptance Criteria

- [ ] The API issues a short-lived, scoped upload URL only to the post owner
- [ ] Only allowed image types and sizes (configurable limits) are accepted, checked by file content and not just extension
- [ ] Uploaded originals are stored in a private bucket with no permanent public URL
- [ ] A local development storage adapter works when cloud storage credentials are not configured

## Tasks

### TASK-044: Storage driver selection, presign/head on the storage seam, local dev adapter
**Status:** done

### TASK-045: `media_assets` schema, migration and shared media contract
**Status:** done

### TASK-046: Post media API (upload slot, complete, list, owner preview, delete)
**Status:** done

### TASK-047: Image upload on the studio post edit page
**Status:** done
