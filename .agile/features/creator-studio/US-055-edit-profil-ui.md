# US-055: Edit Profil UI

**Status:** ready_for_uat
**Priority:** high
**Feature:** creator-studio

## Description

As an approved creator, I want to edit my cover, avatar, name, bio and subscription price in one place, so that my profile page looks and costs what I want.

## Acceptance Criteria

- [ ] "Edit Profil" on my profile's cover line opens the form with my current values: cover, avatar, display name, bio with a character count, and subscription price per 30 days.
- [ ] The address `influency.com/{slug}` is shown read-only with a copy button (toast "Tautan disalin") and the note "Alamat profil tidak bisa diubah."
- [ ] Subscription price: whole number 10–5,000 Koin, help text "≈ Rp{price×1.000} per 30 hari · kamu terima ≈ Rp{price×850} setelah biaya platform 15%", and the note "Harga baru berlaku untuk langganan berikutnya." Invalid values block saving with an inline error.
- [ ] Save sends only changed fields through the existing `PATCH /creators/me`, `PUT /creators/me/:kind` and `PUT /creators/me/subscription-plan`. Image type/size errors from the API show under the image. Success shows "Profil diperbarui" and the profile page shows the new values.
- [ ] Leaving with unsaved changes asks for confirmation. Component tests cover validation, read-only slug, partial saves and API errors.

## Tasks

### TASK-201: Edit Profil page (form, price, read-only address, partial save)
**Status:** done
