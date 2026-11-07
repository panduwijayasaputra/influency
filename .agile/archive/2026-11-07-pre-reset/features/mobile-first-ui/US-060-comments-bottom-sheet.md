# US-060: Comments Bottom Sheet

**Status:** backlog
**Priority:** high
**Feature:** mobile-first-ui

## Description

As a viewer, I want to read and join a post's conversation in a sheet over the feed, so that I don't lose my place.

## Acceptance Criteria

- [ ] **The sheet.** Komentar opens a bottom sheet over the current page; there is no navigation. It has:
  - a drag handle
  - the title "Komentar" with a count
  - a scrollable list
  - a sticky composer above the keyboard and safe area
  - a close control

  Swipe-down or Escape closes it. The page behind keeps its scroll position and paused videos.
- [ ] **Order.** There is **no** Top/Recent toggle. Comments appear in Top order, with the pinned comment first and shown exactly once. A comment the user just posted appears right under the pinned one. While posting it shows "Mengirim…", and if posting fails it shows an error with retry.
- [ ] **Locked premium post.** The sheet shows only a locked state ("Komentar khusus pendukung") with the Unlock and Subscribe CTAs, which open US-061.
  - No comment bodies, names, avatars or counts are fetched or rendered.
  - The comment count is also hidden on the card.
  - This rule matches CMT-03 in the superseded spec.
- [ ] **Free posts.** Guests can read; writing, replying and liking need login ("Masuk untuk ikut berdiskusi").
- [ ] **Comment actions.**
  - Replies are one level deep.
  - Comments and replies can be liked.
  - The author can edit inline (Simpan/Batal); an edited item shows the "Diedit" label.
  - The author can delete their own comment, with an inline confirmation.
  - The owner's menu has Sematkan / Lepas sematan / Hapus. One pinned top-level comment at most.
  - A viewer's menu has Laporkan.
  - The creator's replies carry a Creator badge.
  - A deleted parent that still has replies shows "Komentar dihapus" above them. A deleted parent without replies is omitted.
  - The existing comment API is used where it exists. Replies, pin, comment likes and edit are dummy until their backend exists.
