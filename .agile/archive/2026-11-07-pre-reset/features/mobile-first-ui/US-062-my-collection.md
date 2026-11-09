# US-062: My Collection — Saved & Purchased

**Status:** backlog
**Priority:** medium
**Feature:** mobile-first-ui

## Description

As a signed-in user, I want one place with the posts I saved and the posts I bought, so that I can find them again.

## Acceptance Criteria

- [ ] **Koleksi Saya** (`/library`) lists posts the user **saved** or **purchased**, not liked ones. A post that is both appears once.
- [ ] Controls:
  - a creator dropdown ("Semua creator" plus each creator)
  - a Semua / Disimpan / Dibeli segmented control
  - a media type filter (Semua Konten / Gambar / Video)
  - sort (Terbaru ditambahkan / Terlama)
  - a Grid / Vertikal display toggle
- [ ] Grid tiles carry a **Dibeli** or **Disimpan** tag. The Vertikal view uses PostCard. A note explains that saving a premium post keeps it here but never unlocks it.
- [ ] A locked premium post that was only saved still shows only the safe preview. Media access always follows the real entitlement check.
- [ ] Empty and guest states are shown. Data is dummy until save and purchase backends exist (US-029).
