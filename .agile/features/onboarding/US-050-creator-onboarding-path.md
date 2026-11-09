# US-050: Creator Onboarding Path UI

**Status:** ready_for_uat
**Priority:** high
**Feature:** onboarding

## Description

As a user who wants to be a creator, I want a guided application with my profile and subscription price, so that I can submit everything in one go.

## Acceptance Criteria

- [x] `/become-creator` renders the stepper on the creator path (standalone, no app shell): **Profil** (display name, address with the live `influency.com/{slug}` preview and the existing slug rules, bio), **Langganan**, **Pencairan**, **Tinjau & kirim**. It keeps the existing states: pending notice, approved → Studio link, rejected → prefilled resubmit with the rejection reason. Logged out → `/login?returnTo=/become-creator`.
- [x] **Langganan** step: one price per 30 days, a whole number 10–5,000 Koin (out of range → "Masukkan angka 10–5.000 Koin."), presets 25 / 50 / 100 / 150, and an estimate in Rupiah of the gross and the creator's 85% share after the 15% fee, computed with integers. The copy states renewal is manual and premium posts are priced per post when published.
- [x] **Pencairan** step shows a "Perlu konfirmasi" placeholder explaining that the bank account is added later in Rekening Pencairan. No bank or account data is collected.
- [x] **Tinjau & kirim** lists profile, address and price, each with an Ubah link back to its step. Submit is blocked until the Creator Terms box is ticked. A taken or reserved slug from the server returns me to Profil with the error on the field.
- [x] After submitting, the done screen says the application is under review (not "ready"), and "Ke beranda" leaves the stepper. The submit call goes through one swappable function (the existing apply API, plus the price once US-053 lands).

## Tasks

### TASK-192: Creator stepper (Profil, Langganan, Pencairan, Tinjau, done)
**Status:** done

### TASK-193: `/become-creator` renders the creator stepper
**Status:** done
