# US-053: Subscription Price in the Creator Application

**Status:** ready_for_uat
**Priority:** medium
**Feature:** onboarding

## Description

As a creator applicant, I want the subscription price I chose to be live when I am approved, so that fans can subscribe right away.

## Acceptance Criteria

- [x] `POST /creators/apply` accepts `subscriptionPriceCoins`, a whole number 10–5,000 (9 and 5,001 → 400). It is stored as an integer with the application and returned by `GET /creators/me/application`. A rejected applicant can change it when resubmitting.
- [x] On admin approval, the same transaction creates the creator's single active subscription plan (version 1, 30 days) at that price. Approving twice never creates a second plan. Without a price, approval creates no plan, as today.
- [x] A pending or rejected applicant has no plan, so nobody can subscribe to them. The price is never shown on a public page before approval.
- [x] Later price changes still go through `PUT /creators/me/subscription-plan` and affect future purchases only.
- [x] The US-050 submit sends the price. Integration tests cover the bounds, storage, resubmit, plan creation on approval, no duplicate plan, and no plan while pending or rejected.

## Tasks

### TASK-197: Store the price with the application and create the plan on approval
**Status:** done
