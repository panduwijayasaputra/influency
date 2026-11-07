# US-067: Discover — Videos & Search

**Status:** backlog
**Priority:** low
**Feature:** mobile-first-ui

## Description

As a user, I want to explore creators through short videos and search, so that I can find new people to follow.

## Acceptance Criteria

- [ ] **Jelajahi** (`/discover`) has two tabs: **Video** and **Cari**.
- [ ] **Video** is a full-screen vertical snap feed of creator videos. Each shows creator name, followers, caption, duration and a link to the profile. Only the visible item plays (muted, following US-057). Only free or entitled videos are used; locked premium is never played.
- [ ] **Cari** has a search field ("Cari creator"), a "Baru dilihat" list with "Lihat semua", and results by name or @username. It shows "Tidak ada creator yang cocok dengan '…'" when nothing matches.
- [ ] Video items, search results and recently-viewed are dummy until a discovery backend exists. Ranking is marked as "Perlu konfirmasi".
