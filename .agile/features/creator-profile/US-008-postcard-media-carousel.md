# US-008: PostCard with Media Carousel

**Status:** ready_for_uat
**Priority:** high
**Feature:** creator-profile

## Description

As a visitor scrolling a creator's posts, I want each post shown as a card with its media, caption and actions, so that I can browse content like in a social app.

## Acceptance Criteria

- [x] The card shows, top to bottom:
  - **header:** avatar, creator name, @slug, relative publish time (Asia/Jakarta), and a "Lainnya" (more) menu with **Bagikan** and **Laporkan** (the existing report flow)
  - **media**
  - **action row:** Suka · Komentar · Bagikan · Simpan on the left, and **Kirim Tip** on the right only on an accessible premium post
  - **like count**
  - **caption:** two lines, with **Selengkapnya** to expand. Tapping the caption opens the post detail page.
- [x] Media with more than one item is a swipeable carousel with a position indicator (dots and "n/total"). Each item keeps a fixed aspect ratio, so the card doesn't jump while media loads.
- [x] A **locked premium** post shows:
  - only the server-generated blurred preview (or the lock placeholder)
  - a **Premium** chip
  - "n foto · n video"
  - a **Buka · n Koin** button that opens the existing demo purchase sheet

  Original media URLs never appear in its HTML or props.
- [x] Free and accessible premium media is loaded through the access-checked media endpoint, and an accessible premium post shows an **Terbuka** chip.
- [x] **Suka** works as today: a toggle with its count. **Bagikan** shares the post URL (native share, or copy with a toast). **Komentar** opens the post detail at its comments. **Simpan** and **Kirim Tip** show a "Segera hadir" toast. A guest's actions go to `/login` with `returnTo` (US-007).

## Tasks

### TASK-020: Viewer-aware public feed (access, viewer, comment count, media kinds)
**Status:** done

### TASK-021: Trusted proxy for the client IP (`TRUST_PROXY`)
**Status:** done

### TASK-022: PostCard component
**Status:** done

### TASK-023: PostCard list on the creator page, remove the old grid, docs
**Status:** done
