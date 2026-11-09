# US-048: Welcome Stepper Shell & Path Choice

**Status:** ready_for_uat
**Priority:** high
**Feature:** onboarding

## Description

As a newly signed-in user, I want a short welcome that asks how I will use Influency, so that I start on the right path.

## Acceptance Criteria

- [x] `/welcome` is a standalone page with no top bar, bottom nav or drawer. Guests are sent to `/login?returnTo=/welcome`. `welcome` is added to the reserved slugs, so no creator can take it.
- [x] The first screen greets the user by first name ("Selamat datang, {nama}") and offers two radio cards: user ("Jelajahi dan dukung creator") and creator ("Bagikan konten sebagai creator"), with the note that they can become a creator later from the account menu. "Lanjut" stays disabled until a card is chosen.
- [x] After a choice, the header shows Back, "Langkah X dari Y", step labels and a progress bar with correct `progressbar` ARIA values. Back on the first step returns to the path choice.
- [x] Choosing the creator path when the user already has an application (pending, rejected or approved) goes to the matching `/become-creator` state instead of a new application.
- [x] The page works at 360 px wide with ≥ 44 px targets, keyboard and screen-reader support for the radio cards. Step data comes from one swappable source (dummy until US-051).

## Tasks

### TASK-190: Welcome route, stepper chrome and path choice
**Status:** done
