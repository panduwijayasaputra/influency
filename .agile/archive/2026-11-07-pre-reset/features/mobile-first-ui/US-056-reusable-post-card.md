# US-056: Reusable Post Card & Media Carousel

**Status:** backlog
**Priority:** high
**Feature:** mobile-first-ui

## Description

As a viewer, I want every post to look and behave the same wherever I see it, so that the app is predictable.

## Acceptance Criteria

- [ ] **One PostCard, used everywhere.** It shows, in order:
  - a creator header: avatar, name, @username, date and a ··· menu
  - the caption
  - the media carousel
  - the action row: **Suka · Komentar · Bagikan · Simpan** on the left, **Kirim Tip** on the right
  - an Unlock CTA when the post is premium and locked

  It is used by Home, the creator Postingan tab, the Collection vertical view and the Post Detail page.
- [ ] **Carousel.** Multi-media posts swipe horizontally with slides at about 86% width, a right peek, a counter and dots. A single media item fills the width with no peek.
- [ ] **Locked premium posts** show a single safe blurred preview tile plus a price badge and an Unlock CTA. Original media is never sent. Unlocked premium and free posts load media through the existing media-access flow.
- [ ] **Taps.** Tapping the caption opens the Post Detail page (US-068). Tapping the media opens the full-screen viewer at that slide (US-068). Komentar opens the Comments sheet (US-060).
- [ ] **Simpan** toggles a saved state with a toast ("Disimpan ke Koleksi Saya" / "Dihapus dari Disimpan"). It needs login, is dummy until a save backend exists, and never grants access (Saving ≠ entitlement). Like keeps using the real like API and also grants nothing.
- [ ] **Kirim Tip visibility.** It is shown only on accessible premium posts, only to a viewer with an active subscription or a prior purchase from that creator, and never on free posts, the viewer's own posts or for guests. Eligibility is dummy until tips exist and defaults to hidden.
- [ ] **Bagikan** uses native share with a copy-link fallback and always shares the post URL, never a media URL. The ··· menu offers:
  - for the owner: **Edit post**, **Salin link** and **Arsipkan**, which use the existing archive API
  - for viewers: **Salin link** and **Laporkan**, which use the existing report flow
