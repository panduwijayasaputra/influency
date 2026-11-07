# US-068: Post Detail Page & Full-Screen Media Viewer

**Status:** backlog
**Priority:** high
**Feature:** mobile-first-ui

## Description

As a viewer, I want to open a post on its own page or view its media full screen, so that I can read the whole conversation or enjoy the media without distractions.

## Acceptance Criteria

- [ ] Tapping a caption opens Post Detail (`/{creatorSlug}/posts/{postId}`). The page has a back header, the PostCard content and the comments list (same rules as US-060), with a sticky comment input at the bottom. The existing post detail page is adjusted, not replaced, and keeps SSR of public data only.
- [ ] Tapping media opens a full-screen viewer at 9:16 with a close control. Users swipe or drag between the post's media items and see a position indicator.
- [ ] The viewer has an action row: **Suka · Komentar · Bagikan · Kirim Tip**. Kirim Tip follows US-056 eligibility. Komentar opens comments as a sheet covering about 40% of the screen over the viewer.
- [ ] Locked premium media in the viewer shows only the safe preview and the Unlock CTA. Escape or swipe-down closes the viewer and returns to the same scroll position.
