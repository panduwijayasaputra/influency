# US-049: Upload Limits & Stale Upload Cleanup

**Status:** ready_for_uat
**Priority:** medium
**Feature:** creator-content
**Source:** Video Infrastructure v1 §7, §12, §15

## Description

As an approved creator, I want clear upload limits and failed uploads to clear themselves, so that broken uploads don't block my posts or waste storage.

## Acceptance Criteria

- [x] Maximum image size, video size and video duration are configurable placeholders (TBD values); exceeding them is rejected server-side with a clear message
- [x] Uploads not completed before their slot expires, and videos stuck processing beyond a configured time, are marked failed and stop counting toward the post's media limit
- [x] Abandoned video uploads are deleted from the video provider
- [x] Video readiness can be updated from a verified provider webhook; duplicate, replayed or out-of-order events never regress an asset's state; polling remains a fallback
- [x] A creator sees failed uploads in the studio and can remove or retry them

## Tasks

### TASK-077: Rejection reason, error code and env settings
**Status:** done

### TASK-078: Unified media refresh, limit checks, sweeper
**Status:** done

### TASK-079: Verified Cloudflare Stream processing webhook
**Status:** done

### TASK-080: Failed uploads in the studio (Hapus / Coba lagi)
**Status:** done
