# US-062: Payout Accounts API

**Status:** ready_for_uat
**Priority:** high
**Feature:** creator-studio

## Description

As an approved creator, I want to store up to 3 payout bank accounts with one active, so that Influency knows where to send my money.

## Acceptance Criteria

- [ ] `GET/POST /me/payout-accounts`, `POST /me/payout-accounts/:id/activate`, `DELETE /me/payout-accounts/:id` (approved creator, session + CSRF on writes). Input: bank code from a configured shared list, account number (digits only after removing spaces, 6–20), holder name (trimmed, 1–100). Invalid input → 400 with field messages.
- [ ] Max 3 accounts per creator (4th → 409). Exactly one is active: the first is active automatically, activating one deactivates the others in one transaction, and a DB constraint prevents two active rows, also under concurrent requests.
- [ ] Deleting the active account or the only account → 409. Deleting someone else's account → 404.
- [ ] Responses only contain bank, last 4 digits, holder name, active and created date; the full number is never returned or logged.
- [ ] US-057 uses this API instead of dummy data. Integration tests cover limits, active rules, concurrency, isolation and masking.

## Tasks

### TASK-212: Field encryption helper + env key
**Status:** done

### TASK-213: Payout accounts service, controller and web wiring
**Status:** done
