# US-007: Guest Access Rules in the Shell

**Status:** ready_for_uat
**Priority:** medium
**Feature:** app-foundation

## Description

As a guest, I want to be guided to log in only where an account is needed, so that I can still browse creator profiles freely.

## Acceptance Criteria

Revised with the user on 2026-11-07. This replaces the original AC (guest prompts on Profil/Dompet, nav visible for guests on creator pages).

- [x] Guests may open only `/login`, a creator page `/{creatorSlug}` and its post pages `/{creatorSlug}/posts/{postId}`. Every other page, including Beranda, Jelajahi, Profil, Dompet, Koleksi, Langganan, Diikuti, Notifikasi and Pengaturan, redirects a guest to `/login` with `returnTo` set to that page.
- [x] On the creator and post pages, a guest sees no top bar and no bottom nav.
- [x] Every action a guest takes on those pages (Masuk, Bagikan, Langganan, unlocking a premium post, like, comment, report) goes to `/login` with `returnTo` set to that page. Opening a post from the creator page is allowed.
- [x] The Home top bar and the drawer are never shown to a guest.
- [x] After logging in, the user lands back on the page they came from (existing return-to validation; same-origin relative paths only).

## Tasks

### TASK-017: Guest proxy, guest path rule and signed-in-only Home
**Status:** done

### TASK-018: Signed-in-only shell and page headers
**Status:** done

### TASK-019: Guest view of the creator page (no header, actions to login)
**Status:** done
