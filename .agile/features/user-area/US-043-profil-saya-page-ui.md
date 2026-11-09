# US-043: Profil Saya Page UI

**Status:** ready_for_uat
**Priority:** medium
**Feature:** user-area

## Description

As a signed-in user, I want a Profil page that shows who I am on Influency, so that I can check my name and handle.

## Acceptance Criteria

- [x] For a normal user, `/me` shows the profile header from the design: avatar (initials fallback), display name, @username and bio when present. The data comes from `GET /auth/me`, which now also returns `bio` (new nullable `users.bio`, empty for everyone until Edit Profil exists) and `creatorSlug` (APPROVED creators only).
- [x] **Edit Profil** is shown as a button that opens a "Perlu konfirmasi" notice. The area below the header shows the labelled placeholder "Isi di bawah header belum diputuskan"; no public activity, badges or purchases are shown.
- [x] A creator opening `/me` is redirected to their own creator page (the existing owner view, with Edit Profil to the studio). A cookie-less visitor is sent to login with `returnTo=/me` by the existing proxy, so no guest profile screen is built. After the redirect the Profil tab is not highlighted (accepted).
- [x] The Profil tab in the bottom nav is active on this page. Loading and retryable error states exist.
- [x] Tests cover the user profile, the creator redirect, the logged-out redirect and the `/auth/me` fields. The stub is removed.

## Tasks

### TASK-178: `users.bio` column and `GET /auth/me` bio + creatorSlug
**Status:** done

### TASK-179: `/me` page, `ProfileSummary` and "Perlu konfirmasi" notices
**Status:** done
