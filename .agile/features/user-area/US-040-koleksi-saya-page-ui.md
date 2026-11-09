# US-040: Koleksi Saya Page UI

**Status:** ready_for_uat
**Priority:** high
**Feature:** user-area

## Description

As a signed-in user, I want one page with the posts I saved and bought, so that I can find them again without scrolling a creator's profile.

## Acceptance Criteria

- [x] `/library` shows the title **Koleksi Saya** and these controls, as in the design: a creator dropdown ("Semua creator" first), a Semua / Disimpan / Dibeli segmented filter, a media filter (Semua / Gambar / Video), a sort (Terbaru ditambahkan / Terlama), and a Grid / Vertikal view toggle. There is no "Liked" filter.
- [x] **Grid view** shows 3-column tiles with a tag (**Disimpan** or **Dibeli**), a video badge, and for locked premium a blurred preview with a lock. **Vertikal view** reuses the existing PostCard. A post both saved and bought appears once, tagged Dibeli.
- [x] Opening an unlocked tile opens the full-screen viewer. Opening a locked tile opens the post detail page with the existing unlock sheet. No original media of a locked post is requested.
- [x] States: loading skeleton, empty ("Belum ada apa-apa" with a hint to save posts), empty after a filter, and a retryable error. Guests are sent to login with `returnTo=/library`. The footnote says saving never unlocks a premium post.
- [x] Data comes from one swappable source (dummy data now). Component tests cover filters, sort, view toggle, the dedupe tag, the locked tile and the empty/guest states. The "Segera hadir" stub is removed.

## Tasks

### TASK-171: Library schemas, dummy `fetchLibraryPage` and `usePagedList` hook
**Status:** done

### TASK-172: Shared list-page UI blocks and `GridTile` options
**Status:** done

### TASK-173: `LibraryView` and the `/library` page
**Status:** done
