# Feature: Comments

**Slug:** comments
**Handoff phase:** Phase 3 (content and entitlement: private premium engagement). Feature #3 in [roadmap.md](../../roadmap.md).

## Overview

This feature turns today's flat comment list into the full comment experience:

- a **Comments Bottom Sheet** opened from the PostCard and the full-screen viewer
- one-level **replies**
- **comment likes**
- **edit anytime** with an "Diedit" label
- **delete** with "Komentar dihapus" placeholders that keep replies
- one **pinned** comment per post
- admin comment moderation

Per the roadmap, the UI stories (US-014 to US-016) come first. They are built on the current comments API, and actions the API cannot do yet show a "Segera hadir" toast. The backend stories (US-017 to US-021) then add those capabilities, and each one wires its action into the sheet.

## Sources

- [INFLUENCY_MOBILE_FIRST_UI_UX_SPEC_v1.0.md](../../.docs/INFLUENCY_MOBILE_FIRST_UI_UX_SPEC_v1.0.md):
  - §7 (Comments Bottom Sheet, the LOCKED rules)
  - §8.1 and §8.3 (flows)
  - §9 CMT-01 to CMT-15 (QA checklist)
- [design/HANDOFF.md](../../../design/HANDOFF.md): **no Top/Recent toggle**. Comments always use Top order with the pinned comment first. This supersedes UX spec §7.3 (see roadmap.md). Locked premium comments are private: no names, avatars or text.
- Artboards (reference only, never copied into the app):
  - [S05-Comments-Entitled](../../../design/artboards/S05-Comments-Entitled.dc.html)
  - [S06-Comments-Locked](../../../design/artboards/S06-Comments-Locked.dc.html)
  - [S07-Comments-Moderation](../../../design/artboards/S07-Comments-Moderation.dc.html)
  - the comments-sheet states in [Home.dc.html](../../../design/artboards/Home.dc.html)

## Decisions

- **No sort toggle.** The design wins over UX spec §7.3.
- **Top order formula is OPEN** (UX spec §7.3). Use a documented, swappable placeholder: like count descending, then newest first. Never present it as final policy.
- **Premium comments follow the post access rule** (UX spec §7.2, LOCKED). Read, write, edit and like all need the same server-side access as the media:
  - the post owner and admins are the exceptions
  - until the purchases feature ships, that means owner/admin only on locked premium posts
  - the existing `PREMIUM_COMMENTS_WRITE_WITHOUT_ACCESS` flag stays off by default
- **Deleted text never comes back.** A deleted comment is never sent again in any response. Its body, author name and avatar are omitted.
- **Reporting comments** is DRAFT in UX spec §7.9 and out of scope here.

## Open points

- The Top order formula (above).
- Replying to a reply: the UI shows one level (UX spec §7.4, DRAFT). A reply to a reply is attached to the same top-level parent.

## Stories

| ID | Title | Priority |
|---|---|---|
| US-014 | Comments Bottom Sheet | high |
| US-015 | Comment Thread UI (replies, likes, labels) | high |
| US-016 | Comment Actions Menu (edit, delete, pin) | high |
| US-017 | Replies and Top Order API | high |
| US-018 | Comment Likes API | high |
| US-019 | Edit Comment API | medium |
| US-020 | Pin Comment API | medium |
| US-021 | Admin Comment Moderation | medium |
