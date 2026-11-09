# Feature: Onboarding

**Slug:** onboarding
**Handoff phase:** Phase 2 (Telegram Login and public creator route): first-login welcome and the creator application of handoff §5.2. Feature #8 in [roadmap.md](../../roadmap.md).

## Overview

A standalone stepper (no app shell) shown once, right after a user's first login, at `/welcome`:

1. **Choose a path:** "Jelajahi dan dukung creator" (user) or "Bagikan konten sebagai creator" (creator).
2. **User path:** Profil → Ikuti creator → done ("Mulai menjelajah").
3. **Creator path:** Profil (name, `influency.com/{slug}`, bio) → Langganan (price per 30 days) → Pencairan (placeholder) → Tinjau & kirim (Creator Terms) → done (application pending review).

`/become-creator` (US-010) becomes the same stepper, opened directly on the creator path, and keeps its pending, rejected and approved states.

Per the roadmap, UI stories (US-048 to US-050) come first with one swappable dummy data source. Backend stories (US-051 to US-053) replace it.

## Sources

- Artboards (reference only): [Welcome.dc.html](../../../design/artboards/Welcome.dc.html) (stepper, both paths), [Onboarding.dc.html](../../../design/artboards/Onboarding.dc.html) (creator path standalone), [Login.dc.html](../../../design/artboards/Login.dc.html) (login leads to the welcome).
- Handoff §5.2 (creator onboarding: payout/KYC may be deferred), §5.3 (CREATOR only after admin approval).
- Monetization spec: subscription price 10–5,000 Koin inclusive (LOCKED), one plan per creator, 30-day term, commission 15% (LOCKED).

## Decisions

- **Shown once, on first login.** The server keeps whether the user finished or skipped onboarding. A user who has not is sent to `/welcome` after login, and the original `returnTo` is used when they finish. Users that existed before this feature count as done.
- **No Interests step.** Creators have no topics and recommendations don't use them, so the user path is Profil → Ikuti.
- **The user's Telegram username is read-only.** Only the display name (and optional bio) are editable on the user path. The creator path's address field is the creator slug.
- **The subscription price is part of the application.** It becomes the creator's active plan only when an admin approves. A pending creator has no plan and no Studio access.
- **No bank data is collected.** The Pencairan step is a "Perlu konfirmasi" placeholder pointing to Rekening Pencairan (feature #9).
- **No avatar or cover upload in the stepper.** Images can only be uploaded by an approved creator today, so the stepper shows initials. Uploads stay in Edit Profil.
- Design copy is English; the UI uses Bahasa Indonesia.

## Open points (rendered as "Perlu konfirmasi")

- Creator verification, identity checks and payout fees (design Decisions: "Creator onboarding steps and verification").
- The Creator Terms and content rules text (the link points to the existing agreement placeholder).

## Stories

| ID | Title | Priority |
|---|---|---|
| US-048 | Welcome Stepper Shell & Path Choice | high |
| US-049 | User Onboarding Path UI | high |
| US-050 | Creator Onboarding Path UI | high |
| US-051 | Onboarding Status & First-Login Redirect | high |
| US-052 | Update My Profile API | medium |
| US-053 | Subscription Price in the Creator Application | medium |
