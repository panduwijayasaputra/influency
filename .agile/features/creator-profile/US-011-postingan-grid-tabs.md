# US-011: Postingan and Grid Tabs

**Status:** ready_for_uat
**Priority:** high
**Feature:** creator-profile

## Description

As a visitor, I want to switch between a full post list and a compact grid with filters, so that I can read posts or quickly find a photo, video or premium post.

## Acceptance Criteria

- [x] Under the header, two tabs, **Postingan** and **Grid** (not sticky), switch the content. The current tab is announced to screen readers and survives a page reload (URL query).
- [x] **Postingan** lists the creator's published posts as PostCards (US-008), newest first.
- [x] **Grid** shows 3-column square tiles:
  - a video tile shows its duration
  - a locked premium tile shows a lock on its blurred preview
  - tapping an accessible tile opens the full-screen viewer (US-013), or the post detail until the viewer exists
  - tapping a locked tile opens the post detail
- [x] The Grid has a **Media** dropdown (Semua / Foto / Video) and an **Akses** segmented control (Semua / Gratis / Premium) that filter together. When nothing matches, it shows "Tidak ada yang cocok" with a hint to try another filter.
- [x] With no published posts, both tabs show "Belum ada konten yang dipublikasikan." If the feed fails to load, they show "Konten belum bisa dimuat." without breaking the profile header. The current Gratis/Premium chip grid is replaced.

## Tasks

### TASK-097: PostGrid with tiles and Media/Akses filters
**Status:** done

### TASK-098: Postingan / Grid tabs on the creator page
**Status:** done
