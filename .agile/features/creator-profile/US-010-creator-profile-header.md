# US-010: Creator Profile Header

**Status:** ready_for_uat
**Priority:** high
**Feature:** creator-profile

## Description

As a visitor opening a creator's bio link, I want a clear profile header with who they are and how to follow or subscribe, so that I can decide to support them.

## Acceptance Criteria

- [x] The header shows:
  - the cover image (or a gradient)
  - the avatar (or initials)
  - the creator's name
  - **@slug** with a **Bagikan** icon (shares the profile URL; no Message button)
  - no stats row: photo/video/follower counts were dropped (user decision, 2026-11-07) until real counts exist
- [x] The bio shows two lines with **Selengkapnya** / **Sembunyikan** when it is longer, and keeps line breaks.
- [x] **Ikuti** and **Langganan** are equal-width buttons:
  - **Ikuti** toggles to **Diikuti** locally and shows a "Segera hadir" toast. It is not saved until home-feed.
  - **Langganan** opens the existing demo subscription sheet.
  - The subscribed state **Berlangganan** with "n hari lagi" underneath can be shown with demo data.
- [x] When the creator views their own profile, they see **Edit Profil** on the cover line (→ `/studio/profile`) instead of Ikuti/Langganan.
- [x] A guest sees the same header with no top bar or bottom nav, and Ikuti, Langganan and Bagikan go to `/login` with `returnTo` (US-007). Unknown or suspended creators still show "Kreator tidak ditemukan".

## Tasks

### TASK-095: ExpandableText and the profile header layout
**Status:** done

### TASK-096: Ikuti / Langganan / Berlangganan / Edit Profil actions
**Status:** done
