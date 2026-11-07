# US-035: Notification Consent

**Status:** backlog
**Priority:** medium
**Feature:** telegram-notifications

## Description

As a logged-in user, I want to choose whether Influency may message me on Telegram, so that I only get messages I agreed to.

## Acceptance Criteria

- [ ] The user can grant bot message permission (during login or through the bot `/start` link) and the consent is stored
- [ ] The user can turn Telegram notifications off at any time
- [ ] If the user blocks the bot, Influency disables delivery for that user and stops retrying
