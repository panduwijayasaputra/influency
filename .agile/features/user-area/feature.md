# Feature: User Area

**Slug:** user-area
**Handoff phase:** Phase 3 buyer library and Phase 5 user pages (handoff §3 routes `/library`, `/subscriptions`; §11.3 `GET /me/entitlements`, `GET /me/subscriptions`). Feature #7 in [roadmap.md](../../roadmap.md).

## Overview

The signed-in user's own pages, all reached from the right account drawer (the stubs already exist as "Segera hadir" pages):

- **Koleksi Saya** (`/library`): posts the user saved (**Disimpan**) or bought (**Dibeli**), in one list
- **Diikuti** (`/following`): the creators the user follows
- **Langganan** (`/subscriptions`): active creator subscriptions with days left
- **Profil Saya** (`/me`): the user's own profile header

It also makes the post-card **Simpan** button real (today it shows "Segera hadir").

Per the roadmap, UI stories (US-040 to US-043) come first and use dummy data from one swappable source (today `apps/web/src/lib/demo.ts`). Backend stories (US-044 to US-047) replace it.

## Sources

- [design/HANDOFF.md](../../../design/HANDOFF.md) business rules: "Saving ≠ entitlement", "Collection: Saved / Purchased (not Liked)".
- Artboards (reference only): [Home.dc.html](../../../design/artboards/Home.dc.html) (collection, following, subscriptions, user profile states), [S10-MyProfile-User](../../../design/artboards/S10-MyProfile-User.dc.html), [S11-Collection](../../../design/artboards/S11-Collection.dc.html), [S12-Following](../../../design/artboards/S12-Following.dc.html).
- Monetization spec §4.1 (archived posts stay in the buyer library), handoff §6.4 (entitlement check).

## Decisions

- **Saving is a private bookmark.** It never grants or revokes access, is not counted publicly, and is not shown to the creator.
- **One collection list.** A post that is both saved and bought appears once, tagged **Dibeli**. Filters are Semua / Disimpan / Dibeli (not "Liked").
- **Locked posts in the collection** (saved premium, not unlocked) show the server-blurred preview and open the post detail page. Premium originals are never sent without the entitlement check.
- **Archived posts:** a purchased post stays in Dibeli while archived (spec §4.1). A saved-only post that is archived, unpublished or taken down is hidden from the list.
- **Following and subscription are separate** and each page says so in its copy.
- **Renewal is manual.** The Langganan page only lists subscriptions and links to the creator profile, where the Langganan sheet (feature #6) handles renewal and cancel.
- Design copy is English; the UI uses the Bahasa Indonesia labels in the roadmap table.

## Open points (rendered as "Perlu konfirmasi")

- What the user's own profile shows below the header (public activity, badges, purchases). The design marks this OPEN, so a labelled placeholder is shown.
- **Edit Profil** for a normal user (what can be edited). The button is a labelled placeholder until decided; the creator's own profile and Edit Profil are feature #9.
- Whether unused Koin and purchases survive account deletion (Pengaturan, feature #10).

## Stories

| ID | Title | Priority |
|---|---|---|
| US-040 | Koleksi Saya Page UI | high |
| US-041 | Diikuti Page UI | medium |
| US-042 | Langganan Page UI | medium |
| US-043 | Profil Saya Page UI | medium |
| US-044 | Save Post API & Simpan Button | high |
| US-045 | Collection (Library) API | high |
| US-046 | Following List API | medium |
| US-047 | My Subscriptions List API | medium |
