# US-047: My Subscriptions List API

**Status:** ready_for_uat
**Priority:** medium
**Feature:** user-area

## Description

As a signed-in user, I want my active subscriptions from the server, so that Langganan shows the correct days left.

## Acceptance Criteria

- [x] `GET /me/subscriptions` returns the caller's subscriptions that are active at server time, with the creator summary, `endsAt`, whole days left computed on the server, and `hasScheduledRenewal` (a prepaid next period exists). Expired ones are not listed. Guests get 401 and users are isolated.
- [x] The list is ordered by soonest to expire first. The response is bounded (a user cannot hold more than one active subscription per creator).
- [x] Only the caller's own dates and the public creator shape are returned (no price snapshot; the UI does not show it). No creator-side data (subscriber counts, earnings, other subscribers) is exposed.
- [x] The Langganan UI replaces the dummy data with this endpoint. A subscription that expires between page load and tap shows the expired state on the creator profile (server decides).
- [x] Integration tests cover active vs expired at the boundary, the scheduled renewal flag, ordering, isolation, and that a cancelled scheduled renewal clears the flag.

## Tasks

### TASK-188: `GET /me/subscriptions` (service, controller, tests)
**Status:** done

### TASK-189: Swap the Langganan UI to the real API
**Status:** done
