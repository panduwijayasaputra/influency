# QA Report: TASK-168 — Subscription access, archive grants and Langganan wiring

**Result:** PASS

## Checked (access control, premium protection)

- **`PaidAccessService.facts`** now covers three sources with one query each per page: purchases; active subscription periods (every published premium post of that creator, including ones published later); and the archive grant of spec §4.1 (an archived premium post stays open until the end of a period that was active at `archivedAt`, judged on the open archive episode). A scheduled or later period never matches because it starts after `archivedAt`; someone who subscribes after the archive has no such period; republishing closes the episode so normal subscriber access resumes, and a re-archive is judged afresh. Server (DB) time is used throughout. Cancelled periods never count.
- The facts feed `decidePostAccess` for detail, list, Home feed, media access, likes, comments and reports, so every surface agrees. Media URLs are still minted only after the check; a subscriber gets 200 on `/posts/:id/media-access`, a non-subscriber 403.
- **Isolation:** creator A's subscription does not open creator B's posts; user B is unaffected by user A's period; an expired, cancelled or merely prepaid period gives nothing.
- **`viewer.subscribed`** (new on posts) is true only for an active period and feeds the Unlock sheet disclosure.
- **Wallet activity:** subscription debits show "Langganan · {creator}" with a link to the profile.
- **Web:** `subscribeCreator` is a real request; the Langganan and early-renewal sheets toast the real result and refresh the page; the profile shows "Berlangganan" from the server state. The only remaining purchase dummies are cancel-renewal (US-038) and tips (US-039).

## Tests

`subscription-access.integration.spec.ts` (10 tests): active subscriber incl. later posts, ended / cancelled / prepaid-only, other creator, archive grant until the period ends, subscribing after the archive, scheduled renewal does not extend the grant, republish and re-archive, purchase beats an expired subscription, removed and draft never open, `viewer.subscribed`. Web: `purchases.test.ts` (subscribe request and error), `wallet-activity.test.tsx`. `pnpm check` green: shared 249, API 954, web 667.

## Notes for UAT

- Product gap, not a defect: the Unlock sheet's "already covered by Langganan" disclosure is wired to `viewer.subscribed`, but a subscriber sees the post unlocked, so no screen lets them open that sheet yet. Buying permanent access while subscribed works through the API only. A "Beli permanen" entry for subscribers needs a design decision.
- Spec-creator leftovers are dated 2000-01-01 (`LEFTOVER_CREATED_AT`) so they rank last in the shared test database.
