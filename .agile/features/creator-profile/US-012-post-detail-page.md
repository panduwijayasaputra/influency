# US-012: Post Detail Page

**Status:** ready_for_uat
**Priority:** medium
**Feature:** creator-profile

## Description

As a visitor, I want a post's own page with the full content and its comments, so that I can read everything about one post and join the conversation.

## Acceptance Criteria

- [ ] `/{creatorSlug}/posts/{postId}` shows the post as a full PostCard (US-008) with the caption expanded, followed by the **Komentar** section. A signed-in user sees the page header "Postingan" with a back button; a guest sees neither (US-007).
- [ ] The comment input sticks to the bottom above the keyboard, and the existing comment rules apply:
  - plain text, a 500-character counter, Hapus for the author or the creator
  - "Masuk untuk berkomentar" for guests
  - comments of a locked premium post stay private (no names, avatars or text)
- [ ] Opening **Komentar** from a PostCard lands on this page scrolled to the comments.
- [ ] A locked premium post shows the blurred preview, the price "n Koin · akses permanen" and the Buka action (demo sheet, or login for guests). It never shows original media.
- [ ] A hidden, removed or unknown post still shows "Postingan tidak ditemukan". Owners and admins still see the status notice on non-published posts.

## Tasks

### TASK-099: PostCard `detail` mode
**Status:** done

### TASK-100: Post page uses PostCard
**Status:** done

### TASK-101: Sticky comment composer and scroll to comments
**Status:** done
