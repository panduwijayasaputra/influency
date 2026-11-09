# US-015: Comment Thread UI (replies, likes, labels)

**Status:** ready_for_uat
**Priority:** high
**Feature:** comments

## Description

As a viewer, I want to see replies, like counts and comment states the way the design shows them, so that a conversation is easy to follow.

## Acceptance Criteria

- [ ] Each comment shows the avatar, name, relative time, text, a like heart with a count, and **Balas**.
  - Replies render one level deep under their parent.
  - A collapsed thread shows "Lihat n balasan".
- [ ] Labels:
  - The pinned comment sits at the top with the label "Disematkan oleh creator".
  - An edited comment shows "Diedit".
  - A deleted parent that still has replies shows the placeholder "Komentar dihapus", with no text, name or avatar, and its replies below.
- [ ] The like heart uses the active style when liked. Toggling is optimistic and rolls back with a toast when the request fails. Guests tapping it go to login.
- [ ] Until the API provides these features, the UI degrades gracefully:
  - Fields the current API lacks (replies, likes, pin, edited) are optional in the shared types, and the UI simply hides what is missing.
  - Balas and like show a "Segera hadir" toast.
  - Component tests cover every state with fixtures.
- [ ] Copy is in Bahasa Indonesia, and the layout follows S05-Comments-Entitled at phone width with no horizontal scroll.

## Tasks

### TASK-110: Extend the shared comment schema
**Status:** done

### TASK-111: Comment like client and CommentLikeButton
**Status:** done

### TASK-112: Thread rendering in PostComments (items, replies, labels)
**Status:** done
