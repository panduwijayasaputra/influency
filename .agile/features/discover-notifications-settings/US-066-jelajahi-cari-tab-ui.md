# US-066: Jelajahi Cari Tab UI

**Status:** ready_for_uat
**Priority:** high
**Feature:** discover-notifications-settings

## Description

As a visitor or logged-in user, I want to search creators by name or username and see creators I viewed recently, so that I can get back to them without the bio link.

## Acceptance Criteria

- [ ] The Cari tab shows a labelled search input ("Cari creator"). The Beranda top-bar search icon opens `/discover?tab=cari` with the input focused.
- [ ] Typing (debounced) shows result rows (avatar, name, `@slug`) that open the creator profile; no match shows `Tidak ada creator yang cocok dengan "{query}".`
- [ ] With an empty query, "Baru dilihat" lists recently opened creators (newest first, 5 shown, "Lihat semua" expands). Each row has a remove button with an accessible label; with none, it shows "Creator yang kamu lihat akan muncul di sini."
- [ ] "Baru dilihat" is stored in browser storage on this device only (max 20, de-duplicated, moved to top on reopen), is updated whenever a creator profile is opened in the app, and works without errors when storage is unavailable.
- [ ] Results come from one swappable source (dummy until US-070). Component tests cover search, empty results, recent list add/remove/expand and the top-bar entry point.

## Tasks

### TASK-219: Recent creators store + recording on the creator page
**Status:** done

### TASK-220: Cari tab UI
**Status:** done
