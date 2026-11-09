# US-066: Onboarding Stepper (User & Creator Paths)

**Status:** backlog
**Priority:** medium
**Feature:** mobile-first-ui

## Description

As a newly signed-in user, I want a short guided setup that lets me choose to be a fan or a creator, so that my profile and feed are ready from the start.

## Acceptance Criteria

- [ ] `/welcome` is standalone, with no app shell. It has a Lewati (skip) action, a step indicator and a Back control. It greets the user by first name and asks how they will use Influency: as a user, or as a creator. First login lands here. `welcome` is a reserved slug.
- [ ] **User path:**
  1. **Profil**: cover, name, @username and bio, prefilled from Telegram and validated.
  2. **Minat**: choose topics.
  3. **Ikuti creator**: follow a few suggested creators.

  It finishes with "Mulai menjelajah" → Home. Interests and follows are dummy until their backends exist. The profile fields use the existing profile API where available.
- [ ] **Creator path** (also opened directly by `/become-creator`, only for non-creators):
  1. **Profil**.
  2. **Langganan**: price per 30 days, 10–5.000 Koin, with notes on manual renewal, per-post pricing of 5–1.000 Koin and 0% tip fee.
  3. **Pencairan**: bank, a 6–20 digit account number and the holder name.
  4. **Tinjau & kirim**: a summary with Edit links and a required Creator Terms checkbox.
- [ ] Submitting the creator path uses the existing creator application API (US-010) and shows the pending-review state. Subscription price and payout account are dummy until US-026 and US-038 exist and are labelled "Perlu konfirmasi". Existing creators visiting `/become-creator` are redirected to their profile.
- [ ] Every field shows inline validation errors in Bahasa Indonesia. Required fields block Next until they are valid.
