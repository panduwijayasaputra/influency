# US-035: Creator Subscription Plan API

**Status:** ready_for_uat
**Priority:** high
**Feature:** purchases

## Description

As a creator, I want exactly one subscription plan with a price I control, so that fans can subscribe to all my premium posts. As a visitor, I want to see that plan's price before subscribing.

## Acceptance Criteria

- [x] **Model:** at most one plan per creator; the price is an integer from 10 to 5,000 Koin (DB CHECK); the duration is fixed at 30 days; the plan has an active flag. A price change is append-only (a new version), and existing periods keep their snapshot.
- [x] **Owner API:** an approved creator can set or change their own plan price and activate or deactivate it. Out-of-range prices (9, 5,001, decimals) are rejected with a validation error. Another user or a non-approved creator gets 403. The owner comes from the session, never from request data.
- [x] **Public read:** the creator profile response includes the active plan (price, 30 days) or none. For a signed-in viewer it also includes their subscription state (none / active with `endsAt` / scheduled renewal with dates), computed from server time.
- [x] The demo seed creates plans for the demo creators idempotently.
- [x] The profile Langganan button and sheet read this API instead of `DEMO_SUBSCRIPTION` / `DEMO_SUBSCRIBED`. Integration tests cover the price bounds, one plan per creator, owner-only writes and the version snapshot.

## Tasks

### TASK-162: Subscription plan schema, migration and seed
**Status:** done

### TASK-163: Owner plan API, public subscription state and profile wiring
**Status:** done
