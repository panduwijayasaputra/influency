# US-021: Short-Lived Media Access for Entitled Viewers

**Status:** ready_for_uat
**Priority:** high
**Feature:** content-access

## Description

As a subscriber who has access, I want premium images and video to load when I open a post, so that I can enjoy what I paid for.

## Acceptance Criteria

- [x] `GET /posts/:id/media-access` returns short-lived media URLs/tokens only after the access check passes
- [x] Users without access receive `FORBIDDEN` and no URL
- [x] Media URLs expire after a short configured time and the page can request fresh ones
- [x] Signed media URLs never appear in public page HTML, logs or analytics
- [x] Video plays only through a provider-signed playback token (signed URLs required on every asset, no download allowed); token lifetime is configurable (MVP placeholder 10–30 min) and each refresh re-runs the access check
- [x] The player shows a visible pseudonymous session watermark (no personal data); its limits against screen recording are documented, not claimed as protection
- [x] The media-access endpoint is rate-limited, and authorization events are logged without tokens or URLs
- [x] Free published posts use the same path, so their media loads for anyone without exposing permanent URLs

## Tasks

### TASK-071: Signed download URLs for object storage
**Status:** done

### TASK-072: Signed video playback URLs
**Status:** done

### TASK-073: `GET /posts/:id/media-access` endpoint
**Status:** done

### TASK-074: `PostMediaViewer` + studio preview + protection notes
**Status:** done
