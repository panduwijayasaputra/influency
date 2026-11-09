# US-049: User Onboarding Path UI

**Status:** ready_for_uat
**Priority:** high
**Feature:** onboarding

## Description

As a new user, I want to confirm my profile and follow a few creators, so that my Beranda feed has content from day one.

## Acceptance Criteria

- [x] **Profil** step: the display name and optional bio are prefilled from my account and editable (name 1–60 characters, bio ≤ 500). My Telegram username is shown read-only. An empty name shows "Masukkan nama tampilan." and blocks Lanjut.
- [x] **Ikuti creator** step: lists recommended creators (existing `GET /creators/recommended`) with an Ikuti / Diikuti toggle (existing FollowButton) that uses the existing follow API. A failed follow rolls back with a toast. The step can be skipped ("Lewati"), and an empty list shows a friendly message instead of an error.
- [x] Finishing shows "Selamat datang, {nama}!" with the number of creators followed (or a generic message if none), and "Mulai menjelajah" goes to my original `returnTo` or Beranda.
- [x] Following stays free and separate from subscribing, and the copy says so. No Koin, purchase or subscription action appears in this path.
- [x] The Profil save and "onboarding done" calls go through one swappable function (dummy until US-051 and US-052). A failed save keeps my input and shows an error.

## Tasks

### TASK-191: User path (Profil, Ikuti creator, done)
**Status:** done
