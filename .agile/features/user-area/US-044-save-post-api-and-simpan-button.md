# US-044: Save Post API & Simpan Button

**Status:** ready_for_uat
**Priority:** high
**Feature:** user-area

## Description

As a signed-in user, I want to save a post for later, so that I can find it in Koleksi Saya.

## Acceptance Criteria

- [x] **Save and unsave:** `PUT /posts/:id/save` and `DELETE /posts/:id/save`. Both are idempotent (saving twice keeps one row, unsaving an unsaved post succeeds), backed by a DB unique constraint on (user, post). Guests get 401. The endpoints are rate limited.
- [x] Only posts the viewer can see in public listings can be saved: published, from an approved creator, not archived or taken down. Anything else is a domain error. Saving is allowed for locked premium posts and for your own posts.
- [x] **Saving never changes access.** It grants and revokes no entitlement, and saving a locked premium post still returns the blurred preview only. The save count is private: no public response or creator view exposes it.
- [x] Post responses (feed, profile, detail, grid) include `saved` for a signed-in viewer. The **Simpan** button on PostCard (which the post detail page also uses; the full-screen viewer has no Simpan in the design) is wired with an optimistic toggle and rollback toast. Toasts: "Disimpan ke Koleksi Saya" and "Dihapus dari Disimpan". The "Segera hadir" toast is removed. Guests go to login.
- [x] Integration tests cover idempotency, ineligible posts, the no-entitlement rule, guest rejection, and that no other user sees the save.

## Tasks

### TASK-180: `post_saves` model, migration, endpoints and tests
**Status:** done

### TASK-181: `viewer.saved` in every post response
**Status:** done

### TASK-182: Simpan button wiring, toasts and demo seed
**Status:** done
