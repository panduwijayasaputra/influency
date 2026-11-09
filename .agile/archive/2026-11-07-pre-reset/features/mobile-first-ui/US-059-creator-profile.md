# US-059: Creator Profile — Header, Posts & Grid

**Status:** backlog
**Priority:** high
**Feature:** mobile-first-ui

## Description

As a visitor or owner, I want a creator profile with a clear header and both a feed view and a grid view, so that I can get to know a creator and browse their media.

## Acceptance Criteria

- [ ] **Header**, in order:
  1. Cover image and avatar. On the owner's own profile, **Edit Profil** sits on the cover line.
  2. Display name.
  3. @username with Message and Share icon buttons. Message is a "Perlu konfirmasi" placeholder.
  4. A stats row: photos · videos · followers.
  5. A 2-line bio with a "Selengkapnya" toggle.
- [ ] Visitors see **Ikuti** and **Langganan** buttons at equal width.
  - When subscribed, the second button reads **Berlangganan**, with "x hari lagi" under it.
  - Langganan opens the Subscribe sheet (US-061).
  - The owner sees no Follow/Subscribe/Tip and instead gets a **Post Baru** action.
  - Follow and subscription state are dummy until their backends exist.
- [ ] **Tabs.** There are exactly two tabs, **Postingan** and **Grid**, and they are not sticky. Postingan is a vertical list of PostCards (US-056) from the existing public posts API.
- [ ] **Grid** shows each media item as a 3-column square tile, with no captions and with play, lock and Premium badges.
  - Filters: a **Media** dropdown (Semua / Gambar / Video) and an **Akses** segmented control (Semua / Gratis / Premium). The two filters compose.
  - "Tidak ada yang cocok" appears when nothing matches.
  - Tapping a tile opens the full-screen viewer at that item (proposal, see feature.md).
- [ ] Locked premium tiles show only the safe preview. A guest from a bio link sees the profile with the bottom nav. Unknown slugs still 404.
