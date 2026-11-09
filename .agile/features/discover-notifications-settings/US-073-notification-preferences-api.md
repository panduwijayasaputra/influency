# US-073: Notification Preferences API

**Status:** ready_for_uat
**Priority:** medium
**Feature:** discover-notifications-settings

## Description

As a logged-in user, I want my notification choices saved on my account, so that I only get the notifications I want on every device.

## Acceptance Criteria

- [ ] A `notification_preferences` row per user (UNIQUE `user_id`) stores per-type opt-outs and `telegramAllowed`; a user without a row gets the US-068 defaults.
- [ ] `GET /me/notification-preferences` returns my settings; `PUT` (CSRF-protected, Zod-validated) updates them. Unknown types → 400; the creator-only earnings type is rejected for non-creators.
- [ ] Producers (US-072) skip opted-out types. Transactional types (top-up success, payout status) cannot be turned off.
- [ ] `telegramAllowed=true` only takes effect once bot access is granted (US-074); until then the API reports Telegram as not connected and the UI shows the connect action.
- [ ] US-068 toggles use these endpoints instead of dummy data. Integration tests cover defaults, update, validation, isolation, and that an opted-out type produces no notification.

## Tasks

### TASK-232: Preferences endpoints + web wiring
**Status:** done
