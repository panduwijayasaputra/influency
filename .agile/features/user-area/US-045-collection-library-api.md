# US-045: Collection (Library) API

**Status:** ready_for_uat
**Priority:** high
**Feature:** user-area

## Description

As a signed-in user, I want my saved and bought posts from one endpoint, so that Koleksi Saya loads fast and never leaks locked content.

## Acceptance Criteria

- [x] `GET /me/library` returns only the caller's items: posts they saved plus posts with a valid post entitlement. A post that is both appears once with `saved: true` and `purchased: true`. Another user's items are never returned (isolation test).
- [x] Query supports `relation` (all / saved / purchased), `creator` (slug), `media` (all / image / video) and `sort` (recent / oldest by the time the item was added, saved or bought, whichever is later; tie-break by ID). Invalid values are rejected. Pagination is cursor-based, so no item is skipped or repeated when items are added during paging.
- [x] Each item uses the same locked/unlocked post shape as other post responses. The entitlement check runs server-side with server time, so a saved-only premium post is returned blurred with no original media URL. Access to bytes still goes through the signed media endpoint.
- [x] **Availability:** a purchased post stays listed while archived or hidden from public discovery (spec §4.1). It is removed on a legal takedown. A saved-only post that is unpublished, archived or taken down, or whose creator is suspended, is excluded.
- [x] The response also gives the creators present in the user's collection, for the dropdown. The Koleksi Saya UI replaces the dummy data with this endpoint. Integration tests cover each rule above, including filters, dedupe and pagination stability.

## Tasks

### TASK-183: Library query helpers (SQL + cursor)
**Status:** done

### TASK-184: `PublicPostsService.library`, controller and integration tests
**Status:** done

### TASK-185: Swap the Koleksi Saya UI to the real API
**Status:** done
