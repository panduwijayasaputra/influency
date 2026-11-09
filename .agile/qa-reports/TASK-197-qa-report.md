# QA Report: TASK-197 — Store the price with the application and create the plan on approval

**Result:** PASS

- `creator_profiles.requested_plan_price_coins BIGINT` with DB CHECK 10–5000 (migration `20261109041000_application_plan_price`). `POST /creators/apply` accepts optional `subscriptionPriceCoins` (integer 10–5.000); it is stored on apply and on a rejected resubmit and returned by apply and `GET /creators/me/application`. Not shown on any public route.
- Approval (`AdminCreatorsService.decide`) creates plan version 1, active, at that price inside the same transaction as the status change; it is skipped when there is no price or the creator already has a plan. The conditional `PENDING_REVIEW` update serialises concurrent approvals; the unique `(creator_profile_id, version)` is the backstop. No Koin or ledger movement.
- Spec (15): bounds 9/5001/10.5/0 rejected, 10/5000 stored, null stays null, DB CHECK refuses 9, no plan while pending (and `/subscription` 404s), exactly one plan on approval, none without a price, second approval 409, two concurrent approvals → one 200 and one 409 and one plan, reject then resubmit with a new price uses the latest, a later `PUT` plan adds version 2 and keeps version 1.
- Shared: `PLAN_PRICE_MIN/MAX` moved to the leaf `constants.ts` to avoid an import cycle (`post-media → creators → purchases → posts → post-media` broke the bundle at load); still exported from the package.
- Web: Langganan prefill from the stored price; a server price error returns to Langganan.
